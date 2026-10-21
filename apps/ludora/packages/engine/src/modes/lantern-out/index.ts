/*
 * Lantern Out: survival on top of the synced-round helpers. Every player has
 * a few lanterns; a wrong or missed answer blows one out and at zero the
 * player is out. Every `reviveEvery` questions is a revival round in which
 * only knocked-out players may answer, and a correct answer relights one
 * lantern. Whether a round is a revival round is decided as it starts and
 * stored, so eligibility cannot change halfway through a question.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ActionResult, ModeContext, PlayerId } from '../../sdk/types.ts';
import {
  leaderboard,
  syncAddPlayer,
  syncAdvance,
  syncAnswer,
  syncBegin,
  syncHostNext,
  syncInit,
  syncOnTimer,
  syncView,
  type SyncConfig,
  type SyncState,
} from '../../mechanics/syncRounds.ts';
import { meta, settings } from './meta.ts';

type Settings = { lives: number; reviveEvery: number; autoAdvance: boolean };

interface State {
  sync: SyncState;
  /** Lanterns still lit per player. 0 means out. */
  lanterns: Record<PlayerId, number>;
  /** Round index on which each knocked-out player's last lantern went out. Cleared when they relight one. */
  outAt: Record<PlayerId, number>;
  /** Round index on which a player still in the game left it (they rank as if they went out then). */
  leftAt: Record<PlayerId, number>;
  startedWith: number;
  /** Whether the current round is a revival round, fixed as the round starts. */
  revival: { round: number; on: boolean };
  /** What the last closed round did, for the reveal. */
  last: { round: number; blown: PlayerId[]; out: PlayerId[]; relit: PlayerId[] } | null;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

const opts = (ctx: ModeContext) => ctx.settings as Settings;
const isOut = (s: State, id: PlayerId) => (s.lanterns[id] ?? 0) <= 0;
const isRevival = (s: State) => s.revival.on && s.revival.round === s.sync.round;

/** 100 points for a correct answer plus up to 100 more for speed, in steps of 10. */
export function lanternPoints(r: { correct: boolean; responseMs: number; limitMs: number }): number {
  if (!r.correct) return 0;
  const speed = Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs));
  return Math.round((100 + 100 * speed) / 10) * 10;
}

/** Whether question number `question` (1-based) is due to be a revival round. */
export function revivalDue(question: number, every: number): boolean {
  return every > 0 && question > 0 && question % every === 0;
}

const cfg: SyncConfig<State> = {
  introMs: 4000,
  revealMs: 5000,
  leaderboardMs: 0,
  autoAdvance: (_s, ctx) => opts(ctx).autoAdvance,
  showLeaderboard: () => false,
  canAnswer: (s, id) => (isRevival(s) ? isOut(s, id) : !isOut(s, id)),
  score: (_s, _id, r) => lanternPoints(r),
  onClosed: (s, ctx) => {
    const round = s.sync.round;
    const revival = isRevival(s);
    const last: NonNullable<State['last']> = { round, blown: [], out: [], relit: [] };
    for (const p of ctx.players()) {
      const a = s.sync.answers[p.id];
      if (revival) {
        if (isOut(s, p.id) && a?.correct) {
          s.lanterns[p.id] = 1;
          delete s.outAt[p.id];
          last.relit.push(p.id);
          ctx.feed(`${p.name} relit a lantern.`, { tone: 'good' });
        }
        continue;
      }
      // Someone who joined after this question appeared has not had a fair go at it.
      if (isOut(s, p.id) || a?.correct || p.joinedAt > s.sync.startedAt) continue;
      s.lanterns[p.id] = Math.max(0, (s.lanterns[p.id] ?? 0) - 1);
      last.blown.push(p.id);
      if (s.lanterns[p.id] === 0) {
        s.outAt[p.id] = round;
        last.out.push(p.id);
        ctx.feed(`${p.name}'s last lantern went out.`, { tone: 'bad' });
      }
    }
    s.last = last;
  },
  isOver: (s, ctx) => {
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    return alive === 0 || (s.startedWith > 1 && alive <= 1);
  },
  onFinished: (s, ctx) => {
    const alive = ctx.players().filter((p) => !isOut(s, p.id));
    if (alive.length === 0) ctx.endGame('Every lantern has gone out.');
    else if (alive.length === 1) ctx.endGame(s.startedWith > 1 ? `${alive[0]!.name} kept the last lantern burning.` : 'Your lantern stayed lit to the end.');
    else ctx.endGame(`${alive.length} players still had a lantern lit at the end.`);
  },
};

/** Decide, as a round starts, whether it is a revival round. */
function roundStarted(s: State, ctx: ModeContext) {
  // Never on the last question: reviving players with nothing left to play for would just undo the game.
  const last = s.sync.round >= s.sync.order.length - 1;
  const due = !last && revivalDue(s.sync.round + 1, opts(ctx).reviveEvery);
  // A revival round with nobody out (or nobody out who is connected) would be a question nobody can answer.
  const waiting = ctx.players().some((p) => p.connected && isOut(s, p.id));
  s.revival = { round: s.sync.round, on: due && waiting };
  if (s.revival.on) ctx.feed('Revival round: players who are out can relight a lantern.', { tone: 'big' });
}

/** Run a step of the round machine and catch the start of a new round. */
function step(s: State, ctx: ModeContext, fn: () => ActionResult): ActionResult {
  const before = s.sync.round;
  const result = fn();
  if (s.sync.round !== before && s.sync.phase === 'question') roundStarted(s, ctx);
  return result;
}

/** 1-based number of the next question that is due to be a revival round, or null. */
function nextRevival(s: State, ctx: ModeContext): number | null {
  const every = opts(ctx).reviveEvery;
  if (every <= 0) return null;
  // A revival round in progress counts as "next"; otherwise look past the current question.
  const current = s.sync.round + 1;
  const from = s.sync.phase === 'question' && isRevival(s) ? current : current + 1;
  const n = Math.ceil(Math.max(1, from) / every) * every;
  return n < s.sync.order.length ? n : null;
}

function teamScores(s: State, ctx: ModeContext) {
  const lives = opts(ctx).lives;
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const lit = members.reduce((n, p) => n + (s.lanterns[p.id] ?? 0), 0);
    const share = members.length ? Math.round((100 * lit) / (members.length * lives)) : 0;
    const points = members.length ? Math.round(members.reduce((n, p) => n + (s.sync.scores[p.id] ?? 0), 0) / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: share, points, members: members.length };
  });
}

const fmt = (n: number) => n.toLocaleString('en-GB');
const lanternsText = (n: number) => `${n} ${n === 1 ? 'lantern' : 'lanterns'}`;

export const lanternOut = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const lanterns: Record<PlayerId, number> = {};
    for (const p of ctx.players()) lanterns[p.id] = ctx.settings.lives;
    const s: State = {
      sync: syncInit(ctx),
      lanterns,
      outAt: {},
      leftAt: {},
      startedWith: ctx.players().length,
      revival: { round: -1, on: false },
      last: null,
    };
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    syncAddPlayer(s, p.id);
    // Players who return keep what they had; new arrivals after the start get one lantern.
    s.lanterns[p.id] ??= s.sync.round >= 0 ? 1 : ctx.settings.lives;
    delete s.leftAt[p.id];
  },
  onPlayerLeave(s, p, ctx) {
    if (!isOut(s, p.id)) s.leftAt[p.id] = Math.max(0, s.sync.round);
    if (s.sync.phase !== 'question') return;
    const waiting = ctx.players().filter((x) => x.connected && cfg.canAnswer!(s, x.id, ctx));
    if (waiting.length && waiting.every((x) => s.sync.answers[x.id])) step(s, ctx, () => syncAdvance(s, cfg, ctx));
  },
  onAction(s, playerId, a, ctx) {
    if (a.iid !== s.sync.iid) return { error: 'That question has closed.' };
    if (s.sync.phase === 'question' && !cfg.canAnswer!(s, playerId, ctx)) {
      return { error: isRevival(s) ? 'This is a revival round: only players who are out can answer.' : 'Your lanterns are out. Wait for a revival round.' };
    }
    return syncAnswer(s, cfg, playerId, a.answer, ctx);
  },
  onTimer(s, id, ctx) {
    step(s, ctx, () => syncOnTimer(s, cfg, id, ctx));
  },
  onHostNext(s, ctx) {
    return step(s, ctx, () => syncHostNext(s, cfg, ctx));
  },
  view(s, viewer, ctx) {
    const st = opts(ctx);
    const players = ctx.players();
    const revealed = s.sync.phase === 'reveal';
    const live = s.sync.phase === 'question' || revealed;
    const last = revealed && s.last && s.last.round === s.sync.round ? s.last : null;
    const names = (ids: PlayerId[]) => ids.map((id) => ctx.player(id)?.name ?? 'A player');
    const roster = players
      .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, lanterns: s.lanterns[p.id] ?? 0, outAt: s.outAt[p.id] ?? null, points: s.sync.scores[p.id] ?? 0 }))
      .sort((a, b) => b.lanterns - a.lanterns || (b.outAt ?? -1) - (a.outAt ?? -1) || b.points - a.points || a.name.localeCompare(b.name));
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    return {
      sync: syncView(s, cfg, viewer, ctx),
      lives: st.lives,
      reviveEvery: st.reviveEvery,
      revival: live && isRevival(s),
      nextRevival: nextRevival(s, ctx),
      alive: players.filter((p) => !isOut(s, p.id)).length,
      out: players.filter((p) => isOut(s, p.id)).length,
      roster: viewer.kind === 'host' ? roster.slice(0, 60) : roster.slice(0, 8),
      last: last ? { blown: last.blown.length, out: names(last.out), relit: names(last.relit) } : null,
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      board: leaderboard(s.sync.scores, s.sync.lastGain, ctx, viewer, 5),
      you: me
        ? {
            lanterns: s.lanterns[me] ?? 0,
            out: isOut(s, me),
            outAt: s.outAt[me] ?? null,
            points: s.sync.scores[me] ?? 0,
            lost: Boolean(last?.blown.includes(me)),
            knockedOut: Boolean(last?.out.includes(me)),
            relit: Boolean(last?.relit.includes(me)),
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const lit = s.lanterns[p.id] ?? 0;
      const pts = s.sync.scores[p.id] ?? 0;
      if (lit > 0 && !p.left) return { playerId: p.id, score: 1_000_000_000 + lit * 10_000_000 + pts, label: `${lanternsText(lit)} lit, ${fmt(pts)} pts` };
      // Knocked out (or left while still in): later is better.
      const at = lit > 0 ? (s.leftAt[p.id] ?? 0) : (s.outAt[p.id] ?? 0);
      return { playerId: p.id, score: (at + 2) * 100_000 + pts, label: lit > 0 ? `Left on question ${at + 1}` : `Out on question ${at + 1}` };
    });
    const teams = ctx.teams().length
      ? teamScores(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score * 1_000_000 + t.points, label: `${t.score}% of lanterns lit` }))
      : undefined;
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    return {
      standings,
      ...(teams ? { teamStandings: teams } : {}),
      summary: alive ? `${alive} ${alive === 1 ? 'lantern holder' : 'lantern holders'} made it to the end.` : 'Every lantern went out.',
    };
  },
  bot(view, ctx) {
    const sync = view?.sync;
    if (sync?.phase !== 'question' || !sync.question || !sync.you?.eligible || sync.you.answered) return null;
    return { type: 'answer', iid: sync.question.iid, answer: ctx.answer(sync.question.iid) };
  },
  botDelay(view, rng) {
    const q = view?.sync?.question;
    if (view?.sync?.phase === 'question' && q?.deadline) {
      const window = Math.max(800, (q.deadline - q.shownAt) * 0.7);
      return 900 + rng.int(0, Math.round(window));
    }
    return 1000;
  },
});
