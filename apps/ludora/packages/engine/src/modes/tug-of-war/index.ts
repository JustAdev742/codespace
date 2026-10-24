/*
 * Tug of War: two sides, one rope.
 *
 * The knot starts at 0 and the sides pull it towards -ropeLength (left) or
 * +ropeLength (right). Teams alternate onto the two sides in team order.
 *
 * Pull formula (team size never decides the game): each correct answer pulls
 *
 *     (connected players on the smaller side) ÷ (connected players on your side)
 *
 * spaces, so the smaller side pulls a full space per correct answer and a
 * bigger side proportionally less. If every player answers at the same rate
 * with the same accuracy, both sides pull the same distance per minute.
 * Connected players are counted so a dropped tablet does not cripple a side.
 * With slack on, a wrong answer lets the rope slip half a pull the other way.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { EnginePlayer, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = { ropeLength: number; slack: boolean; heave: boolean; underdog: boolean; surge: boolean };
export type Side = 'left' | 'right';

const EPS = 1e-6;
/** Heave: every this many correct answers in a row pulls double. */
export const HEAVE_EVERY = 3;
/** Underdog grip: how much harder the side the knot leans away from pulls. */
export const UNDERDOG_GRIP = 1.5;
/** Final surge: pulls count double for this long before time runs out. */
export const SURGE_MS = 30_000;
const SIDES: readonly Side[] = ['left', 'right'];

interface Puller {
  stream: StreamState;
  side: Side;
  /** Correct answers, each one a pull. */
  pulls: number;
  slips: number;
  /** Spaces this player has pulled the knot. */
  distance: number;
}

interface State {
  pullers: Record<PlayerId, Puller>;
  /** Negative leans left, positive leans right. */
  pos: number;
  endsAt: number | null;
  winner: Side | 'draw' | null;
  endedBy: 'line' | 'time' | null;
  /** Highest quarter of the rope each side has been announced reaching. */
  milestones: Record<Side, number>;
  /** Spaces each side has pulled, and how many pulls. */
  totals: Record<Side, number>;
  pullCounts: Record<Side, number>;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const spaces = (n: number) => `${fmt(n)} ${Math.abs(n - 1) < EPS ? 'space' : 'spaces'}`;

/** Spaces one correct answer pulls: (players on the smaller side) ÷ (players on your side). */
export function pullStrength(side: Side, counts: Record<Side, number>): number {
  const mine = Math.max(1, counts[side]);
  const smaller = Math.max(1, Math.min(counts.left, counts.right));
  return smaller / mine;
}

/** Which way the knot leans: exactly level (within rounding) is a draw. */
export function leanOf(pos: number): Side | 'draw' {
  if (Math.abs(pos) < EPS) return 'draw';
  return pos < 0 ? 'left' : 'right';
}

/**
 * A side's team score out of 100: 50 is level, 100 is the knot in its own end
 * zone. Rounded towards the side the knot leans to, so the leaning side always
 * scores more and a dead-level rope gives equal scores.
 */
export function tugScore(side: Side, pos: number, ropeLength: number): number {
  if (leanOf(pos) === 'draw') return 50;
  const towards = side === 'left' ? -pos : pos;
  const raw = 50 + 50 * Math.max(-1, Math.min(1, towards / ropeLength));
  return towards > 0 ? Math.ceil(raw - EPS) : Math.floor(raw + EPS);
}

/** Teams alternate onto the two sides in team order. */
export function sideOfTeamIndex(i: number): Side {
  return i % 2 === 0 ? 'left' : 'right';
}

function teamsOn(side: Side, ctx: ModeContext) {
  return ctx.teams().filter((_, i) => sideOfTeamIndex(i) === side);
}

function sideLabel(side: Side, ctx: ModeContext) {
  const names = teamsOn(side, ctx).map((t) => t.name);
  if (!names.length) return side === 'left' ? 'left side' : 'right side';
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function theSide(side: Side, ctx: ModeContext, capital = false) {
  const text = `the ${sideLabel(side, ctx)}`;
  return capital ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function sideCounts(s: State, ctx: ModeContext, connectedOnly: boolean): Record<Side, number> {
  const c: Record<Side, number> = { left: 0, right: 0 };
  for (const p of ctx.players()) {
    const pl = s.pullers[p.id];
    if (pl && (!connectedOnly || p.connected)) c[pl.side]++;
  }
  return c;
}

function assignSide(s: State, p: EnginePlayer, ctx: ModeContext): Side {
  const i = ctx.teams().findIndex((t) => t.id === p.teamId);
  if (i >= 0) return sideOfTeamIndex(i);
  // Without a team (teams are required, so this is a safety net), join the side with fewer players.
  const c = sideCounts(s, ctx, false);
  return c.left <= c.right ? 'left' : 'right';
}

function newPuller(s: State, p: EnginePlayer, ctx: ModeContext): Puller {
  return { stream: streamInit(ctx), side: assignSide(s, p, ctx), pulls: 0, slips: 0, distance: 0 };
}

/** The side the knot leans away from, or null when it is dead level. */
export function trailingSide(pos: number): Side | null {
  const lean = leanOf(pos);
  return lean === 'draw' ? null : other(lean);
}

const inSurge = (s: State, ctx: ModeContext<Settings>) => ctx.settings.surge && s.endsAt !== null && ctx.now() >= s.endsAt - SURGE_MS;

/** Spaces one correct answer from this side pulls right now, before any heave: team sizes, then underdog grip and the final surge. */
function sideStrength(s: State, side: Side, counts: Record<Side, number>, ctx: ModeContext<Settings>): number {
  let strength = pullStrength(side, counts);
  if (ctx.settings.underdog && trailingSide(s.pos) === side) strength *= UNDERDOG_GRIP;
  if (inSurge(s, ctx)) strength *= 2;
  return strength;
}

function move(s: State, towards: Side, amount: number, ropeLength: number) {
  const next = s.pos + (towards === 'left' ? -amount : amount);
  s.pos = round6(Math.max(-ropeLength, Math.min(ropeLength, next)));
}

function announce(s: State, ctx: ModeContext<Settings>) {
  for (const side of SIDES) {
    const towards = side === 'left' ? -s.pos : s.pos;
    const quarter = Math.floor((towards / ctx.settings.ropeLength) * 4 + EPS);
    if (quarter < 2 || quarter >= 4 || quarter <= s.milestones[side]) continue;
    s.milestones[side] = quarter;
    ctx.feed(quarter === 2 ? `${theSide(side, ctx, true)} have the knot halfway to their line.` : `${theSide(side, ctx, true)} are nearly over the line.`, { tone: 'good' });
  }
}

function topPullers(s: State, ctx: ModeContext, side: Side, limit: number, me: PlayerId | null) {
  return ctx
    .players()
    .filter((p) => s.pullers[p.id]?.side === side)
    .map((p) => ({ playerId: p.id, name: p.name, pulls: s.pullers[p.id]!.pulls, isYou: p.id === me }))
    .sort((a, b) => b.pulls - a.pulls || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export const tugOfWar = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const s: State = {
      pullers: {},
      pos: 0,
      endsAt: ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null,
      winner: null,
      endedBy: null,
      milestones: { left: 0, right: 0 },
      totals: { left: 0, right: 0 },
      pullCounts: { left: 0, right: 0 },
    };
    for (const p of ctx.players()) s.pullers[p.id] = newPuller(s, p, ctx);
    if (s.endsAt) ctx.setTimer('time', s.endsAt);
    if (ctx.settings.surge && s.endsAt !== null) {
      if (s.endsAt - SURGE_MS > ctx.now()) ctx.setTimer('surge', s.endsAt - SURGE_MS);
      else ctx.feed('Final surge! Every pull counts double.', { tone: 'big' });
    }
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.pullers[p.id] ??= newPuller(s, p, ctx);
  },
  onAction(s, playerId, a, ctx) {
    const pl = s.pullers[playerId];
    if (!pl) return { error: 'You are not on a side.' };
    if (s.winner) return { error: 'The tug of war is over.' };
    const res = streamSubmit(pl.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    const L = ctx.settings.ropeLength;
    const counts = sideCounts(s, ctx, true);
    const strength = pullStrength(pl.side, counts);
    let text = 'No pull';
    if (res.correct) {
      const st = ctx.settings;
      const notes: string[] = [];
      let pull = sideStrength(s, pl.side, counts, ctx);
      if (st.underdog && trailingSide(s.pos) === pl.side) notes.push('underdog grip');
      if (inSurge(s, ctx)) notes.push('final surge');
      if (st.heave && res.streak % HEAVE_EVERY === 0) {
        pull *= 2;
        notes.push('heave');
      }
      move(s, pl.side, pull, L);
      pl.pulls++;
      pl.distance = round6(pl.distance + pull);
      s.totals[pl.side] = round6(s.totals[pl.side] + pull);
      s.pullCounts[pl.side]++;
      text = `Pulled ${spaces(pull)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
    } else if (ctx.settings.slack) {
      const slip = strength / 2;
      move(s, other(pl.side), slip, L);
      pl.slips++;
      text = `The rope slipped ${spaces(slip)} the other way`;
    }
    if (pl.stream.last) pl.stream.last.text = text;
    const winner: Side | null = s.pos <= -L + EPS ? 'left' : s.pos >= L - EPS ? 'right' : null;
    if (winner) {
      s.winner = winner;
      s.endedBy = 'line';
      ctx.feed(`${theSide(winner, ctx, true)} pulled the knot over the line.`, { tone: 'big' });
      ctx.endGame();
      return;
    }
    announce(s, ctx);
    streamNext(pl.stream, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === 'surge') {
      if (!s.winner) ctx.feed('Final surge! Every pull now counts double.', { tone: 'big' });
      return;
    }
    if (id !== 'time' || s.winner) return;
    s.winner = leanOf(s.pos);
    s.endedBy = 'time';
    ctx.endGame();
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const pl = me ? s.pullers[me] : undefined;
    const connected = sideCounts(s, ctx, true);
    const present = sideCounts(s, ctx, false);
    const sideView = (side: Side) => {
      const teams = teamsOn(side, ctx).map((t) => ({ id: t.id, name: t.name, hue: t.hue }));
      return {
        label: sideLabel(side, ctx),
        teams,
        hue: teams[0]?.hue ?? (side === 'left' ? 42 : 200),
        players: present[side],
        connected: connected[side],
        strength: sideStrength(s, side, connected, ctx),
        pulls: s.pullCounts[side],
        distance: s.totals[side],
        top: topPullers(s, ctx, side, viewer.kind === 'host' ? 3 : 1, me),
      };
    };
    return {
      endsAt: s.endsAt,
      ropeLength: ctx.settings.ropeLength,
      pos: s.pos,
      slack: ctx.settings.slack,
      winner: s.winner,
      sides: { left: sideView('left'), right: sideView('right') },
      you: pl
        ? {
            side: pl.side,
            pulls: pl.pulls,
            slips: pl.slips,
            distance: pl.distance,
            strength: sideStrength(s, pl.side, connected, ctx),
            streak: pl.stream.streak,
            question: streamQuestionView(pl.stream, ctx),
            last: pl.stream.last,
          }
        : null,
    };
  },
  results(s, ctx) {
    const L = ctx.settings.ropeLength;
    const standings = ctx.everyone().map((p) => {
      const pulls = s.pullers[p.id]?.pulls ?? 0;
      return { playerId: p.id, score: pulls, label: `${pulls} ${pulls === 1 ? 'pull' : 'pulls'}` };
    });
    const lean = s.winner ?? leanOf(s.pos);
    const gap = Math.abs(s.pos);
    const teamStandings = ctx.teams().map((t, i) => {
      const side = sideOfTeamIndex(i);
      let label = 'Draw: the knot finished dead level';
      if (lean === side) label = s.endedBy === 'line' ? 'Won: knot over their line' : `Won: knot ${spaces(gap)} their way`;
      else if (lean !== 'draw') label = s.endedBy === 'line' ? 'Lost: knot over the other line' : `Lost: knot ${spaces(gap)} the other way`;
      return { teamId: t.id, score: tugScore(side, s.pos, L), label };
    });
    let summary: string;
    if (lean === 'draw') summary = s.endedBy === 'time' ? 'Time is up with the knot dead level. It is a draw.' : 'The game ended with the knot dead level.';
    else if (s.endedBy === 'line') summary = `${theSide(lean, ctx, true)} pulled the knot over the line.`;
    else summary = `${s.endedBy === 'time' ? 'Time is up' : 'The game ended'} with the knot ${spaces(gap)} towards ${theSide(lean, ctx)}.`;
    return { standings, ...(teamStandings.length ? { teamStandings } : {}), summary };
  },
  bot(view, ctx) {
    const q = view?.you?.question;
    return q && !view.winner ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 2200 + rng.int(0, 4500);
  },
});
