/*
 * Glim Duels: head-to-head duels between classmates on synced questions.
 *
 * Built on the synced-round helpers (mechanics/syncRounds.ts): the whole room
 * sees each question at the same moment, and every duel resolves when it
 * closes. A duel round is up to `duelLength` questions. When every duel in it
 * has ended (or its last question is done), the helper's leaderboard phase
 * shows the standings and the next pairings. Per-answer points are always 0:
 * duels decide the standings.
 *
 * A hit is a right answer, or a partly right one worth at least half:
 *
 *     round((BASE_HIT + SPEED_BONUS × share of time left) × credit × big × strike)
 *
 * Both hits of a duel land together at the reveal. A shield absorbs the next
 * hit (a power strike is spent on it too). A Glim at 0 health is knocked out;
 * if both go down together, the faster hit wins. After the round's last
 * question: more health wins, then more damage dealt, else a draw.
 *
 * Pairing (Swiss): points, then damage dealt, then a seeded random tiebreak;
 * neighbours pair up, swapping partners to avoid rematches where they can. An
 * odd player out duels the Shadow Glim, a computer rival whose odds are fixed
 * (meta.ts) and shown on screen. Pairings for the next round are planned when
 * a round ends, so the standings can show them, and patched when it starts
 * for anyone who left or joined in between.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ActionResult, ModeContext, PlayerId, Viewer } from '../../sdk/types.ts';
import { createDeck, draw } from '../../questions/deck.ts';
import {
  DEADLINE_GRACE_MS,
  syncAddPlayer,
  syncAnswer,
  syncBegin,
  syncHostNext,
  syncInit,
  syncOnTimer,
  syncView,
  type SyncConfig,
  type SyncState,
} from '../../mechanics/syncRounds.ts';
import { listNames, nameOf, recordingAs } from '../rules.ts';
import {
  BASE_HIT,
  BIG_HITS,
  CHARGE_CAP,
  DUEL_POINTS,
  HEALTH_OPTIONS,
  MEND_HEAL,
  POWER_COST,
  SHADOW_ACCURACY,
  SHADOW_NAME,
  SHADOW_TIME,
  SPEED_BONUS,
  STRIKE_MULT,
  meta,
  settings,
} from './meta.ts';

type Settings = { rounds: number; duelLength: number; health: string; powers: boolean; autoAdvance: boolean; damage: string; teamClash: boolean };

export type Power = keyof typeof POWER_COST;
export const POWERS: readonly Power[] = ['shield', 'strike', 'mend'];
const POWER_NAME: Record<Power, string> = { shield: 'A shield', strike: 'A power strike', mend: 'A mend' };

export interface Side {
  /** null for the Shadow Glim. */
  id: PlayerId | null;
  name: string;
  health: number;
  shield: boolean;
  strike: boolean;
  /** Damage this side has landed in this duel. */
  dealt: number;
}

export interface Hit {
  /** Damage that landed (0 when a shield took it). */
  dmg: number;
  /** Damage before any shield. */
  raw: number;
  blocked: boolean;
  /** A power strike doubled it. */
  strike: boolean;
  /** A partly right answer. */
  partial: boolean;
  /** Answer time, for the tiebreak when both Glims go down together. */
  ms: number;
}

export type Outcome = 0 | 1 | 'draw';

export interface Duel {
  id: string;
  sides: [Side, Side];
  over: boolean;
  /** Index of the side that won, 'draw', or null while it goes on. */
  winner: Outcome | null;
  how: 'ko' | 'time' | 'forfeit' | null;
  /** sync.round of the question it ended on. */
  endedAt: number | null;
  /** The hits of the last question it was fought on, by side. */
  last: { at: number; hits: [Hit | null, Hit | null] } | null;
  /** The Shadow Glim's answer to the open question: decided when it opens, kept out of every view until it closes. */
  shadow: { correct: boolean; ms: number; answered: boolean } | null;
}

export interface Fighter {
  points: number;
  wins: number;
  draws: number;
  losses: number;
  /** Damage landed over the whole game. */
  dealt: number;
  /** Points from duels against the Shadow Glim (Team Clash leaves them out of team totals). */
  shadowPoints: number;
  shadowDuels: number;
  /** Right answers over the whole game, duel or not. */
  right: number;
  charge: number;
  kos: number;
  /** Rivals faced so far (the Shadow Glim is not counted), to avoid rematches. */
  faced: PlayerId[];
  /** This round's duel, or null while waiting for the next round. */
  duel: string | null;
}

/** A planned duel: two players, or a player and the Shadow Glim (null). */
export type Pairing = [PlayerId, PlayerId | null];

interface State {
  sync: SyncState;
  /** For each question in the order: it already came up earlier in this game. */
  repeats: boolean[];
  /** The duel round under way (0-based); -1 before the first. */
  round: number;
  /** The question within the duel round (0-based). */
  q: number;
  /** The current duel round has finished: standings come next. */
  roundOver: boolean;
  /** The last duel round has finished. */
  finished: boolean;
  duels: Duel[];
  /** Pairings planned for the next round, shown before it starts. */
  next: Pairing[] | null;
  fighters: Record<PlayerId, Fighter>;
  /** Powers used on the open question. */
  used: Record<PlayerId, Power>;
  /** Knockouts at the last reveal. */
  kos: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('power'), iid: z.string().max(24), power: z.enum(['shield', 'strike', 'mend']) }),
]);
type Action = z.infer<typeof action>;

const SHADOW_TIMER = 'shadow';
const opts = (ctx: ModeContext) => ctx.settings as Settings;
const maxHealthOf = (ctx: ModeContext): number => {
  const n = Number(opts(ctx).health);
  return (HEALTH_OPTIONS as readonly number[]).includes(n) ? n : 100;
};
const isBig = (ctx: ModeContext) => opts(ctx).damage === 'big';
const clashOn = (ctx: ModeContext) => opts(ctx).teamClash && ctx.teams().length >= 2;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How much of a hit an answer is worth: 1 when right, its share when at least half right, else nothing. */
export const creditOf = (a: { correct: boolean; partial: number }) => (a.correct ? 1 : a.partial >= 0.5 ? a.partial : 0);

/** Damage of one hit before any shield. */
export function hitDamage(r: { credit: number; responseMs: number; limitMs: number }, o: { big?: boolean; strike?: boolean } = {}): number {
  if (r.credit <= 0) return 0;
  const left = Math.min(1, Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs)));
  return Math.round((BASE_HIT + SPEED_BONUS * left) * r.credit * (o.big ? BIG_HITS : 1) * (o.strike ? STRIKE_MULT : 1));
}

/** Who wins a duel that reached its last question without a knockout. */
export function decideOnTime(sides: readonly [{ health: number; dealt: number }, { health: number; dealt: number }]): Outcome {
  const [a, b] = sides;
  if (a.health !== b.health) return a.health > b.health ? 0 : 1;
  if (a.dealt !== b.dealt) return a.dealt > b.dealt ? 0 : 1;
  return 'draw';
}

export function newFighter(): Fighter {
  return { points: 0, wins: 0, draws: 0, losses: 0, dealt: 0, shadowPoints: 0, shadowDuels: 0, right: 0, charge: 0, kos: 0, faced: [], duel: null };
}

/* ------------------------------- pairing ------------------------------- */

export interface PairEntry {
  id: PlayerId;
  points: number;
  dealt: number;
  /** Seeded random tiebreak, drawn fresh for each pairing. */
  tie: number;
  team: string | null;
  shadowDuels: number;
  faced: readonly PlayerId[];
}

/**
 * Swiss pairing. Rank by points, damage dealt, then the random tiebreak; the
 * odd player out (the lowest-ranked of those who have met the Shadow Glim the
 * fewest times) duels the Shadow Glim; everyone else pairs with the nearest
 * player below them they have not faced, and a rematch the greedy pass could
 * not avoid is swapped away with another pair when a swap allows. With
 * `clash`, every pair is across two teams: players a team has too many of
 * (the same fewest-Shadow rule) duel the Shadow Glim instead.
 */
export function pairFighters(entries: readonly PairEntry[], clash: boolean): Pairing[] {
  const ranked = entries.slice().sort((a, b) => b.points - a.points || b.dealt - a.dealt || a.tie - b.tie);
  const rank = new Map(ranked.map((e, i) => [e.id, i]));
  let pool = ranked.slice();
  const shadow: PairEntry[] = [];
  const toShadow = (candidates: PairEntry[]) => {
    const fewest = Math.min(...candidates.map((c) => c.shadowDuels));
    const pick = candidates.filter((c) => c.shadowDuels === fewest).at(-1)!;
    shadow.push(pick);
    pool = pool.filter((p) => p !== pick);
  };
  const teamOf = (e: PairEntry) => e.team ?? '';
  const biggestTeam = () => {
    const counts = new Map<string, number>();
    for (const p of pool) counts.set(teamOf(p), (counts.get(teamOf(p)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  };
  if (clash) {
    // No team may outnumber all the others together, or some of it could not be paired across teams.
    for (let big = biggestTeam(); big && big[1] * 2 > pool.length; big = biggestTeam()) toShadow(pool.filter((p) => teamOf(p) === big[0]));
  }
  if (pool.length % 2 === 1) {
    const big = biggestTeam();
    toShadow(clash && big ? pool.filter((p) => teamOf(p) === big[0]) : pool);
  }
  const canPair = (a: PairEntry, b: PairEntry) => !clash || teamOf(a) !== teamOf(b);
  const faced = (a: PairEntry, b: PairEntry) => a.faced.includes(b.id) || b.faced.includes(a.id);
  const pairs: [PairEntry, PairEntry][] = [];
  const left = pool.slice();
  while (left.length >= 2) {
    const a = left.shift()!;
    let j = left.findIndex((b) => canPair(a, b) && !faced(a, b));
    if (j < 0) j = left.findIndex((b) => canPair(a, b));
    if (j < 0) {
      shadow.push(a);
      continue;
    }
    pairs.push([a, left.splice(j, 1)[0]!]);
  }
  shadow.push(...left);
  // A rematch the greedy pass could not avoid: swap partners with the nearest pair that makes both new pairs fresh.
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i]!;
    if (!faced(a, b)) continue;
    const others = pairs.map((_, k) => k).filter((k) => k !== i).sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
    for (const k of others) {
      const [c, d] = pairs[k]!;
      if (canPair(a, c) && canPair(b, d) && !faced(a, c) && !faced(b, d)) {
        pairs[i] = [a, c];
        pairs[k] = [b, d];
        break;
      }
      if (canPair(a, d) && canPair(b, c) && !faced(a, d) && !faced(b, c)) {
        pairs[i] = [a, d];
        pairs[k] = [b, c];
        break;
      }
    }
  }
  const out: Pairing[] = [
    ...pairs.map(([a, b]): Pairing => (rank.get(a.id)! <= rank.get(b.id)! ? [a.id, b.id] : [b.id, a.id])),
    ...shadow.map((e): Pairing => [e.id, null]),
  ];
  return out.sort((x, y) => rank.get(x[0])! - rank.get(y[0])!);
}

/** Pairing entries for everyone in the game now, with fresh tiebreaks. */
function entriesFor(s: State, ids: readonly PlayerId[], ctx: ModeContext): PairEntry[] {
  return ids.map((id) => {
    const f = s.fighters[id] ?? newFighter();
    return { id, points: f.points, dealt: f.dealt, tie: ctx.rng.next(), team: ctx.player(id)?.teamId ?? null, shadowDuels: f.shadowDuels, faced: f.faced };
  });
}

function planNext(s: State, ctx: ModeContext): Pairing[] {
  return pairFighters(
    entriesFor(
      s,
      ctx.players().map((p) => p.id),
      ctx,
    ),
    clashOn(ctx),
  );
}

/**
 * The planned pairings, patched for who is here now: pairs that lost a player
 * break up, and their partners, anyone new and anyone planned against the
 * Shadow Glim are paired among themselves.
 */
function settlePairings(s: State, ctx: ModeContext): Pairing[] {
  const here = new Set(ctx.players().map((p) => p.id));
  const keep: Pairing[] = [];
  const loose: PlayerId[] = [];
  const placed = new Set<PlayerId>();
  for (const [a, b] of s.next ?? []) {
    const aIn = here.has(a);
    const bIn = b !== null && here.has(b);
    if (aIn && bIn) keep.push([a, b]);
    else {
      if (aIn) loose.push(a);
      if (bIn) loose.push(b);
    }
    placed.add(a);
    if (b) placed.add(b);
  }
  for (const p of ctx.players()) if (!placed.has(p.id)) loose.push(p.id);
  return [...keep, ...pairFighters(entriesFor(s, loose, ctx), clashOn(ctx))];
}

/* -------------------------------- rounds ------------------------------- */

function sideOf(d: Duel, id: PlayerId): 0 | 1 | null {
  return d.sides[0].id === id ? 0 : d.sides[1].id === id ? 1 : null;
}

function duelOf(s: State, id: PlayerId): Duel | undefined {
  const f = s.fighters[id];
  return f?.duel ? s.duels.find((d) => d.id === f.duel) : undefined;
}

function startDuelRound(s: State, ctx: ModeContext) {
  const pairs = settlePairings(s, ctx);
  s.round++;
  s.q = 0;
  s.roundOver = false;
  s.next = null;
  for (const f of Object.values(s.fighters)) f.duel = null;
  const health = maxHealthOf(ctx);
  const side = (id: PlayerId | null): Side => ({ id, name: id ? nameOf(ctx, id) : SHADOW_NAME, health, shield: false, strike: false, dealt: 0 });
  s.duels = pairs.map(([a, b], i) => {
    const id = `r${s.round + 1}d${i + 1}`;
    const fa = (s.fighters[a] ??= newFighter());
    fa.duel = id;
    if (b) {
      const fb = (s.fighters[b] ??= newFighter());
      fb.duel = id;
      fa.faced.push(b);
      fb.faced.push(a);
    } else fa.shadowDuels++;
    return { id, sides: [side(a), side(b)], over: false, winner: null, how: null, endedAt: null, last: null, shadow: null };
  });
}

/** A question just opened: a new duel round when the last one is over, the Shadow Glim's answers, and a fresh power each. */
function questionStarted(s: State, ctx: ModeContext) {
  if (s.round < 0 || s.roundOver) startDuelRound(s, ctx);
  else s.q++;
  s.used = {};
  const limit = s.sync.deadline - s.sync.startedAt;
  for (const d of s.duels) {
    d.shadow = null;
    if (d.over || d.sides[1].id !== null) continue;
    const correct = ctx.rng.next() < SHADOW_ACCURACY;
    const share = SHADOW_TIME[0] + ctx.rng.next() * (SHADOW_TIME[1] - SHADOW_TIME[0]);
    d.shadow = { correct, ms: Math.round(limit * share), answered: false };
  }
  armShadow(s, ctx);
}

/** The Shadow Glim locks in at its moment, so its rival sees it answer. Its answer still waits for the reveal. */
function armShadow(s: State, ctx: ModeContext) {
  const due = s.duels.filter((d) => d.shadow && !d.shadow.answered).map((d) => s.sync.startedAt + d.shadow!.ms);
  if (due.length && s.sync.phase === 'question') ctx.setTimer(SHADOW_TIMER, Math.min(...due));
  else ctx.clearTimer(SHADOW_TIMER);
}

function shadowTick(s: State, ctx: ModeContext) {
  if (s.sync.phase !== 'question') return;
  const now = ctx.now();
  for (const d of s.duels) if (d.shadow && !d.shadow.answered && s.sync.startedAt + d.shadow.ms <= now) d.shadow.answered = true;
  armShadow(s, ctx);
}

function endDuel(s: State, d: Duel, winner: Outcome, how: NonNullable<Duel['how']>) {
  d.over = true;
  d.winner = winner;
  d.how = how;
  d.endedAt = s.sync.round;
  ([0, 1] as const).forEach((i) => {
    const id = d.sides[i].id;
    const f = id ? s.fighters[id] : undefined;
    if (!f) return;
    const result = winner === 'draw' ? 'draw' : winner === i ? 'win' : 'loss';
    const pts = DUEL_POINTS[result];
    f.points += pts;
    if (result === 'win') f.wins++;
    else if (result === 'draw') f.draws++;
    else f.losses++;
    if (d.sides[1 - i]!.id === null) f.shadowPoints += pts;
    if (how === 'ko' && result === 'win') f.kos++;
  });
}

/** The current round is over: plan the next one, or mark the game finished. */
function finishRound(s: State, ctx: ModeContext) {
  s.roundOver = true;
  if (s.round >= opts(ctx).rounds - 1) s.finished = true;
  else s.next = planNext(s, ctx);
}

/** One side's hit on the question that just closed, or null for a miss. Spends a ready power strike. */
function hitBy(s: State, d: Duel, i: 0 | 1, limitMs: number, big: boolean): Hit | null {
  const side = d.sides[i];
  let credit = 0;
  let ms = 0;
  let partial = false;
  if (side.id === null) {
    if (d.shadow?.correct) {
      credit = 1;
      ms = d.shadow.ms;
    }
  } else {
    const a = s.sync.answers[side.id];
    if (a) {
      credit = creditOf(a);
      ms = a.responseMs;
      partial = !a.correct;
    }
  }
  if (credit <= 0) return null;
  const strike = side.strike;
  side.strike = false;
  const raw = hitDamage({ credit, responseMs: ms, limitMs }, { big, strike });
  return { dmg: raw, raw, blocked: false, strike, partial, ms };
}

/** A side as a feed line names it. */
const who = (side: Side) => (side.id ? side.name : `the ${SHADOW_NAME}`);
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Knockout {
  winner: string;
  loser: string;
  /** Both Glims went down on the same question. */
  both: boolean;
  /** Both went down and the faster hit decided it. */
  faster: boolean;
}

/** Both hits of a duel land together; then a knockout, or the end of the duel on time. */
function resolveDuel(s: State, d: Duel, ctx: ModeContext): Knockout | null {
  const limitMs = s.sync.deadline - s.sync.startedAt;
  const hits: [Hit | null, Hit | null] = [hitBy(s, d, 0, limitMs, isBig(ctx)), hitBy(s, d, 1, limitMs, isBig(ctx))];
  ([0, 1] as const).forEach((i) => {
    const h = hits[i];
    const target = d.sides[1 - i]!;
    if (h && target.shield) {
      target.shield = false;
      h.blocked = true;
      h.dmg = 0;
    }
  });
  ([0, 1] as const).forEach((i) => {
    const h = hits[i];
    if (!h || h.dmg <= 0) return;
    const target = d.sides[1 - i]!;
    target.health = Math.max(0, target.health - h.dmg);
    d.sides[i].dealt += h.dmg;
    const f = d.sides[i].id ? s.fighters[d.sides[i].id!] : undefined;
    if (f) f.dealt += h.dmg;
  });
  d.last = { at: s.sync.round, hits };
  const down: [boolean, boolean] = [d.sides[0].health <= 0, d.sides[1].health <= 0];
  if (down[0] || down[1]) {
    let winner: Outcome;
    if (down[0] && down[1]) {
      const [m0, m1] = [hits[0]!.ms, hits[1]!.ms];
      winner = m0 < m1 ? 0 : m1 < m0 ? 1 : 'draw';
    } else winner = down[0] ? 1 : 0;
    endDuel(s, d, winner, 'ko');
    if (winner === 'draw') return { winner: who(d.sides[0]), loser: who(d.sides[1]), both: true, faster: false };
    return { winner: who(d.sides[winner]), loser: who(d.sides[1 - winner]!), both: down[0] && down[1], faster: down[0] && down[1] };
  }
  if (s.q >= opts(ctx).duelLength - 1) endDuel(s, d, decideOnTime(d.sides), 'time');
  return null;
}

const cfg: SyncConfig<State> = {
  introMs: 5000,
  revealMs: 6000,
  leaderboardMs: 8000,
  autoAdvance: (_s, ctx) => opts(ctx).autoAdvance,
  showLeaderboard: (s) => s.roundOver,
  // Duels, not answers, decide the standings.
  score: () => 0,
  onClosed: (s, ctx) => {
    const st = opts(ctx);
    ctx.clearTimer(SHADOW_TIMER);
    // Everyone who answered builds charge and counts their right answers, in a duel or not.
    for (const [pid, a] of Object.entries(s.sync.answers)) {
      const f = s.fighters[pid];
      if (!f) continue;
      if (a.correct) f.right++;
      if (st.powers && creditOf(a) > 0) f.charge = Math.min(CHARGE_CAP, f.charge + 1);
    }
    const kos: Knockout[] = [];
    for (const d of s.duels) {
      if (d.over) continue;
      const ko = resolveDuel(s, d, ctx);
      if (ko) kos.push(ko);
    }
    s.kos = kos.length;
    if (kos.length === 1) {
      const k = kos[0]!;
      const text = k.faster
        ? `${upper(k.winner)} and ${k.loser} knocked each other out! ${upper(k.winner)} was faster.`
        : k.both
          ? `${upper(k.winner)} and ${k.loser} knocked each other out!`
          : `${upper(k.winner)} knocked out ${k.loser}!`;
      ctx.feed(text, { tone: 'big' });
    } else if (kos.length > 1) ctx.feed(`${kos.length} knockouts!`, { tone: 'big' });
    if (s.duels.every((d) => d.over) || s.q >= st.duelLength - 1) finishRound(s, ctx);
  },
  isOver: (s) => s.finished,
  onFinished: (s, ctx) => ctx.endGame(summaryOf(s, ctx)),
};

/** Run a step of the round machine and catch the start of a new question. */
function step(s: State, ctx: ModeContext, fn: () => ActionResult): ActionResult {
  const before = s.sync.round;
  const result = fn();
  if (s.sync.round !== before && s.sync.phase === 'question') questionStarted(s, ctx);
  return result;
}

function usePower(s: State, playerId: PlayerId, power: Power, iid: string, ctx: ModeContext): ActionResult {
  if (!opts(ctx).powers) return { error: 'Powers are off in this game.' };
  if (s.sync.phase !== 'question' || iid !== s.sync.iid) return { error: 'Powers can only be used while a question is open.' };
  if (ctx.now() > s.sync.deadline + DEADLINE_GRACE_MS) return { error: 'Time is up.' };
  const f = s.fighters[playerId];
  const d = duelOf(s, playerId);
  const i = d ? sideOf(d, playerId) : null;
  if (!f || !d || i === null) return { error: 'You join the next round. Powers are for duels.' };
  if (d.over) return { error: 'Your duel is over. Save your charge for the next round.' };
  if (s.sync.answers[playerId]) return { error: 'Use a power before you answer.' };
  if (s.used[playerId]) return { error: 'One power per question.' };
  const cost = POWER_COST[power];
  if (f.charge < cost) return { error: `${POWER_NAME[power]} needs ${plural(cost, 'charge', 'charges')}.` };
  const me = d.sides[i];
  if (power === 'shield' && me.shield) return { error: 'Your shield is already up.' };
  if (power === 'strike' && me.strike) return { error: 'Your power strike is already ready.' };
  const max = maxHealthOf(ctx);
  if (power === 'mend' && me.health >= max) return { error: 'You are already at full health.' };
  f.charge -= cost;
  s.used[playerId] = power;
  if (power === 'shield') me.shield = true;
  else if (power === 'strike') me.strike = true;
  else me.health = Math.min(max, me.health + MEND_HEAL);
}

/* -------------------------------- views -------------------------------- */

export interface StandingRow {
  playerId: PlayerId;
  name: string;
  teamId: string | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  dealt: number;
  rank: number;
}

/** Composite standing: points, then damage dealt, then right answers. */
const standingScore = (f: Fighter) => f.points * 10_000_000 + Math.min(f.dealt, 99_999) * 100 + Math.min(f.right, 99);

function standings(s: State, ctx: ModeContext): StandingRow[] {
  const rows = ctx.players().map((p) => {
    const f = s.fighters[p.id] ?? newFighter();
    return { row: { playerId: p.id, name: p.name, teamId: p.teamId, points: f.points, wins: f.wins, draws: f.draws, losses: f.losses, dealt: f.dealt, rank: 0 }, score: standingScore(f) };
  });
  rows.sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name));
  let lastScore = Number.NaN;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.score !== lastScore) {
      lastRank = i + 1;
      lastScore = r.score;
    }
    r.row.rank = lastRank;
  });
  return rows.map((r) => r.row);
}

interface TeamRow {
  teamId: string;
  name: string;
  hue: number;
  score: number;
  members: number;
}

/** Average points per player, or with Team Clash the total of duel points (leaving out wins over the Shadow Glim). */
function teamRows(s: State, ctx: ModeContext): TeamRow[] {
  const clash = clashOn(ctx);
  return ctx.teams().map((t) => {
    if (clash) {
      const everyone = ctx.everyone().filter((p) => p.teamId === t.id);
      const total = everyone.reduce((n, p) => n + Math.max(0, (s.fighters[p.id]?.points ?? 0) - (s.fighters[p.id]?.shadowPoints ?? 0)), 0);
      return { teamId: t.id, name: t.name, hue: t.hue, score: total, members: ctx.players().filter((p) => p.teamId === t.id).length };
    }
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const total = members.reduce((n, p) => n + (s.fighters[p.id]?.points ?? 0), 0);
    const avg = members.length ? Math.round((total / members.length) * 10) / 10 : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: avg, members: members.length };
  });
}

/*
 * Views stay small with a projector full of duels: flags appear only when
 * set, and a side carries its name only when the player has left (screens
 * find everyone else's name in the room's player list; id null is the
 * Shadow Glim).
 */

export interface SideView {
  id: PlayerId | null;
  health: number;
  /** Charge held; absent for the Shadow Glim, which has no powers. */
  charge?: number;
  shield?: true;
  strike?: true;
  /** Locked in an answer to the open question (never whether it is right). */
  answered?: true;
  /** Only for a player who has left the game. */
  name?: string;
}

export interface HitView {
  /** Damage of the hit; a blocked hit lands none of it. */
  dmg: number;
  blocked?: true;
  strike?: true;
  partial?: true;
}

function sideView(s: State, d: Duel, i: 0 | 1, ctx: ModeContext): SideView {
  const side = d.sides[i];
  const f = side.id ? s.fighters[side.id] : undefined;
  const answered = s.sync.phase === 'question' && (side.id === null ? Boolean(d.shadow?.answered) : Boolean(s.sync.answers[side.id]));
  return {
    id: side.id,
    health: side.health,
    ...(f ? { charge: f.charge } : {}),
    ...(side.shield ? { shield: true as const } : {}),
    ...(side.strike ? { strike: true as const } : {}),
    ...(answered ? { answered: true as const } : {}),
    ...(side.id && !ctx.player(side.id) ? { name: side.name } : {}),
  };
}

const hitView = (h: Hit | null): HitView | null =>
  h ? { dmg: h.raw, ...(h.blocked ? { blocked: true as const } : {}), ...(h.strike ? { strike: true as const } : {}), ...(h.partial ? { partial: true as const } : {}) } : null;

/** The hits of the question being revealed (or the last one the duel was fought on, once answers are shown). */
function hitsShown(s: State, d: Duel) {
  const revealed = s.sync.phase === 'reveal' || s.sync.phase === 'leaderboard' || s.sync.phase === 'done';
  if (!revealed || !d.last) return null;
  if (s.sync.phase === 'reveal' && d.last.at !== s.sync.round) return null;
  return d.last;
}

const endedNow = (s: State, d: Duel) => d.over && d.endedAt === s.sync.round && s.sync.phase === 'reveal';

function hostDuel(s: State, d: Duel, ctx: ModeContext) {
  const last = hitsShown(s, d);
  return {
    id: d.id,
    sides: [sideView(s, d, 0, ctx), sideView(s, d, 1, ctx)],
    ...(d.winner !== null ? { winner: d.winner, how: d.how } : {}),
    ...(last ? { hits: [hitView(last.hits[0]), hitView(last.hits[1])] } : {}),
    ...(endedNow(s, d) ? { endedNow: true as const } : {}),
  };
}

function playerDuel(s: State, d: Duel, i: 0 | 1, ctx: ModeContext) {
  const last = hitsShown(s, d);
  const j = (1 - i) as 0 | 1;
  return {
    id: d.id,
    me: sideView(s, d, i, ctx),
    rival: sideView(s, d, j, ctx),
    result: d.winner === null ? null : d.winner === 'draw' ? 'draw' : d.winner === i ? 'win' : 'loss',
    how: d.how,
    hits: last ? { mine: hitView(last.hits[i]), theirs: hitView(last.hits[j]) } : null,
    endedNow: endedNow(s, d),
  };
}

function summaryOf(s: State, ctx: ModeContext): string {
  const all = ctx.everyone().map((p) => ({ name: p.name, f: s.fighters[p.id] ?? newFighter() }));
  if (!all.some((x) => x.f.wins + x.f.draws + x.f.losses > 0)) return 'No duels were fought.';
  const best = Math.max(...all.map((x) => standingScore(x.f)));
  const top = all.filter((x) => standingScore(x.f) === best);
  const f = top[0]!.f;
  if (f.wins === 0 && f.draws === 0) return 'Nobody won a duel this time.';
  const record = f.wins > 0 ? plural(f.wins, 'win') : plural(f.draws, 'draw');
  if (top.length > 1) return `${listNames(top.map((x) => x.name))} share the top spot with ${record} each.`;
  return f.wins > 0 ? `${top[0]!.name} is the duel champion with ${record}.` : `${top[0]!.name} tops the standings with ${record}.`;
}

function recordLabel(f: Fighter): string {
  if (f.wins + f.draws + f.losses === 0) return 'No duels';
  return `${plural(f.wins, 'win')}${f.draws ? `, ${plural(f.draws, 'draw')}` : ''}`;
}

/* -------------------------------- bots --------------------------------- */

interface BotSide {
  health: number;
  shield: boolean;
  strike: boolean;
  /** null for the Shadow Glim, which has no powers. */
  charge: number | null;
  answered: boolean;
}

/**
 * The power a bot uses now, if any. Mend when low (45% of full health or
 * less); shield against a rival's ready strike. When it is about to answer
 * (`ready`), strike while the rival is healthy (over 40%) and cannot shield
 * in reply: no shield up, and either already answered or out of charge.
 */
export function botPower(v: { charge: number; used: string | null; max: number; me: BotSide; rival: BotSide; ready: boolean }): Power | null {
  if (v.used) return null;
  if (v.charge >= POWER_COST.mend && v.me.health <= v.max * 0.45 && v.me.health < v.max) return 'mend';
  if (v.charge >= POWER_COST.shield && v.rival.strike && !v.me.shield) return 'shield';
  const open = !v.rival.shield && (v.rival.answered || (v.rival.charge ?? 0) < POWER_COST.shield);
  if (v.ready && v.charge >= POWER_COST.strike && v.rival.health > v.max * 0.4 && !v.me.strike && open) return 'strike';
  return null;
}

/** How long a bot thinks before answering a question: its own share of the time limit, 12% to 70%, the same every time for that bot and question. */
export function botThinkMs(playerId: string, iid: string, limitMs: number): number {
  let h = 2166136261;
  for (const ch of `${playerId}|${iid}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Math.round(limitMs * (0.12 + 0.58 * ((h % 10_000) / 10_000)));
}

interface BotView {
  rules?: { powers: boolean; health: number };
  duel?: { result: string | null; me: BotSide; rival: BotSide } | null;
  you?: { charge: number; used: string | null } | null;
}

function botPowerFromView(view: BotView | null | undefined, ready: boolean): Power | null {
  const d = view?.duel;
  if (!view?.rules?.powers || !d || d.result !== null || !view.you) return null;
  return botPower({ charge: view.you.charge, used: view.you.used, max: view.rules.health, me: d.me, rival: d.rival, ready });
}

/* -------------------------------- mode --------------------------------- */

export const glimDuels = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const st = ctx.settings;
    const sync = syncInit(ctx);
    // syncInit's order is the pool (shuffled, cut to the question limit). The game needs one question per duel
    // question, so the pool deals round again, reshuffled, rather than the game ending early.
    const deck = createDeck(sync.order.length ? sync.order : ctx.questions.ids(), ctx.rng, ctx.common.shuffleQuestions);
    sync.order = Array.from({ length: st.rounds * st.duelLength }, () => draw(deck, ctx.rng));
    const repeats = sync.order.map((qid, i) => sync.order.indexOf(qid) < i);
    const fighters: Record<PlayerId, Fighter> = {};
    for (const p of ctx.players()) fighters[p.id] = newFighter();
    const s: State = { sync, repeats, round: -1, q: 0, roundOver: false, finished: false, duels: [], next: null, fighters, used: {}, kos: 0 };
    s.next = planNext(s, ctx);
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    syncAddPlayer(s, p.id);
    s.fighters[p.id] ??= newFighter();
    // Mid-round, a newcomer (or a player back after leaving, whose duel was forfeited) waits for the next pairing and answers meanwhile.
    if (s.round >= 0 && !s.roundOver && !s.finished) {
      const last = s.round >= opts(ctx).rounds - 1;
      const text = last ? 'This is the last duel round. Answer along for practice.' : opts(ctx).powers ? 'You join the next round. Answer now to build charge for your first duel.' : 'You join the next round. Answer now to warm up.';
      ctx.feed(text, { to: [p.id], tone: 'info' });
    }
  },
  onPlayerLeave(s, p, ctx) {
    const d = duelOf(s, p.id);
    const i = d ? sideOf(d, p.id) : null;
    if (!d || i === null || d.over) return;
    // Leaving forfeits the duel: the rival wins it.
    endDuel(s, d, (1 - i) as 0 | 1, 'forfeit');
    const rival = d.sides[1 - i]!;
    if (rival.id) ctx.feed(`${p.name} left, so you win your duel.`, { to: [rival.id], tone: 'good' });
    // Between questions, a round whose last duel just ended goes straight to the standings.
    if (s.sync.phase === 'reveal' && !s.roundOver && s.duels.every((x) => x.over)) finishRound(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    if (a.type === 'power') return usePower(s, playerId, a.power, a.iid, ctx);
    if (a.iid !== s.sync.iid) return { error: 'That question has closed.' };
    // A question dealt a second time counts for reports, not again for rewards.
    const c = s.repeats[s.sync.round] ? recordingAs(ctx, 'attempt') : ctx;
    return syncAnswer(s, cfg, playerId, a.answer, c);
  },
  onTimer(s, id, ctx) {
    if (id === SHADOW_TIMER) return shadowTick(s, ctx);
    step(s, ctx, () => syncOnTimer(s, cfg, id, ctx));
  },
  onHostNext(s, ctx) {
    return step(s, ctx, () => syncHostNext(s, cfg, ctx));
  },
  view(s, viewer: Viewer, ctx) {
    const st = opts(ctx);
    const rows = standings(s, ctx);
    const phase = s.sync.phase;
    const planning = (phase === 'intro' || phase === 'leaderboard') && s.next !== null;
    const base = {
      sync: syncView(s, cfg, viewer, ctx),
      round: s.round,
      rounds: st.rounds,
      q: s.q,
      duelLength: st.duelLength,
      roundOver: s.roundOver,
      rules: {
        health: maxHealthOf(ctx),
        big: isBig(ctx),
        powers: st.powers,
        cost: POWER_COST,
        cap: CHARGE_CAP,
        mend: MEND_HEAL,
        hit: [hitDamage({ credit: 1, responseMs: 1, limitMs: 1 }, { big: isBig(ctx) }), hitDamage({ credit: 1, responseMs: 0, limitMs: 1 }, { big: isBig(ctx) })],
        shadow: { accuracy: Math.round(SHADOW_ACCURACY * 100), from: Math.round(SHADOW_TIME[0] * 100), to: Math.round(SHADOW_TIME[1] * 100) },
        clash: clashOn(ctx),
      },
      teams: ctx.teams().length ? teamRows(s, ctx) : null,
      kos: phase === 'reveal' ? s.kos : 0,
    };
    if (viewer.kind === 'host') {
      const live = phase === 'question' || phase === 'reveal';
      return {
        ...base,
        board: rows.slice(0, 10),
        // The duel cards are for questions and reveals; between rounds the big screen shows standings and the next pairings.
        duels: live ? s.duels.map((d) => hostDuel(s, d, ctx)) : [],
        next: planning ? s.next : null,
        waiting: live && !s.roundOver ? ctx.players().filter((p) => !s.duels.some((d) => sideOf(d, p.id) !== null)).length : 0,
      };
    }
    const id = viewer.playerId;
    const f = s.fighters[id];
    const d = duelOf(s, id);
    const i = d ? sideOf(d, id) : null;
    const mine = rows.find((r) => r.playerId === id) ?? null;
    let next: { rival: { id: PlayerId; name: string } | null; shadow: boolean } | null = null;
    if (planning) {
      const pair = s.next!.find(([a, b]) => a === id || b === id);
      if (pair) {
        const other = pair[0] === id ? pair[1] : pair[0];
        next = { rival: other ? { id: other, name: nameOf(ctx, other) } : null, shadow: other === null };
      }
    }
    return {
      ...base,
      board: { rows: rows.slice(0, 5), you: mine },
      duel: d && i !== null ? playerDuel(s, d, i, ctx) : null,
      next,
      you: f
        ? {
            charge: f.charge,
            points: f.points,
            wins: f.wins,
            draws: f.draws,
            losses: f.losses,
            dealt: f.dealt,
            right: f.right,
            rank: mine?.rank ?? null,
            used: s.sync.phase === 'question' ? (s.used[id] ?? null) : null,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standingsOut = ctx.everyone().map((p) => {
      const f = s.fighters[p.id] ?? newFighter();
      return { playerId: p.id, score: standingScore(f), label: recordLabel(f) };
    });
    const clash = clashOn(ctx);
    const teams = ctx.teams().length
      ? teamRows(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: clash ? `${plural(t.score, 'point')} in total` : `${t.score} ${t.score === 1 ? 'point' : 'points'} per player` }))
      : undefined;
    return { standings: standingsOut, ...(teams ? { teamStandings: teams } : {}), summary: summaryOf(s, ctx) };
  },
  bot(view, ctx) {
    const sync = view?.sync;
    const q = sync?.question;
    if (sync?.phase !== 'question' || !q || sync.you?.answered) return null;
    // Bots think before they answer, so a practice duel is a race a person can win.
    const limit = q.deadline !== null ? q.deadline - q.shownAt : 15_000;
    const think = botThinkMs(ctx.playerId, q.iid, limit);
    const waited = ctx.now - q.shownAt;
    // A power goes before the answer, but never holds it up for long, even if the power keeps being refused.
    const power = waited < think + 1500 ? botPowerFromView(view, waited >= think) : null;
    if (power) return { type: 'power', iid: q.iid, power };
    return waited >= think ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    // While a question is open and unanswered, look again often: the bot answers once its thinking time is up.
    if (view?.sync?.phase === 'question' && view.sync.question && !view.sync.you?.answered) return 500 + rng.int(0, 500);
    return 1000;
  },
});
