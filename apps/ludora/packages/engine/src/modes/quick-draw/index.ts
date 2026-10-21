/*
 * Quick Draw: buzzer rounds on top of the synced-round helpers. The round
 * closes on the first correct answer (closeOnFirstCorrect), which wins it a
 * point. Each player gets one try per question, so a wrong answer locks them
 * out until the next one; with the penalty on it also costs a point.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
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

type Settings = { penalty: boolean; target: number; autoAdvance: boolean };

export interface RoundWin {
  /** Round index (0-based). */
  round: number;
  playerId: PlayerId;
  responseMs: number;
}

interface State {
  sync: SyncState;
  /** Every round won so far, in order. */
  wins: RoundWin[];
  /** Round in which each player last lost a point to the penalty. */
  penalised: Record<PlayerId, number>;
  /** Wrong answers per player over the whole game. */
  misses: Record<PlayerId, number>;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

const opts = (ctx: ModeContext) => ctx.settings as Settings;

function nameOf(ctx: ModeContext, id: PlayerId): string {
  return ctx.player(id)?.name ?? ctx.everyone().find((p) => p.id === id)?.name ?? 'A player';
}

function secondsText(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

/** The player who has reached the target, if a target is set and someone has. */
function champion(s: State, ctx: ModeContext): PlayerId | null {
  const target = opts(ctx).target;
  if (target <= 0) return null;
  return Object.entries(s.sync.scores).find(([, v]) => v >= target)?.[0] ?? null;
}

const cfg: SyncConfig<State> = {
  introMs: 3000,
  revealMs: 4500,
  leaderboardMs: 0,
  autoAdvance: (_s, ctx) => opts(ctx).autoAdvance,
  // The tally sits beside every reveal, so there is no separate leaderboard phase.
  showLeaderboard: () => false,
  closeOnFirstCorrect: true,
  score: (s, playerId, r, ctx) => {
    if (r.correct) return 1;
    s.misses[playerId] = (s.misses[playerId] ?? 0) + 1;
    // syncRounds only ever adds points, so the penalty comes off here, at submission.
    if (opts(ctx).penalty && (s.sync.scores[playerId] ?? 0) > 0) {
      s.sync.scores[playerId] = (s.sync.scores[playerId] ?? 0) - 1;
      s.penalised[playerId] = s.sync.round;
    }
    return 0;
  },
  onClosed: (s, ctx) => {
    const round = s.sync.round;
    for (const [pid, r] of Object.entries(s.penalised)) if (r === round) s.sync.lastGain[pid] = -1;
    // closeOnFirstCorrect means there is at most one correct answer per round.
    const first = Object.entries(s.sync.answers).find(([, a]) => a.correct);
    if (!first) return;
    const [playerId, a] = first;
    s.wins.push({ round, playerId, responseMs: a.responseMs });
    ctx.feed(`${nameOf(ctx, playerId)} was first, in ${secondsText(a.responseMs)}.`, { tone: 'good' });
  },
  isOver: (s, ctx) => champion(s, ctx) !== null,
  onFinished: (s, ctx) => {
    const champ = champion(s, ctx);
    const target = opts(ctx).target;
    if (champ) ctx.endGame(`${nameOf(ctx, champ)} reached ${target} ${target === 1 ? 'point' : 'points'} first.`);
    else if (!s.wins.length) ctx.endGame('Nobody took a round this time.');
    else ctx.endGame('That was the last question.');
  },
};

/** Teams score the rounds their players win (minus any penalties). */
function teamScores(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const score = members.reduce((n, p) => n + (s.sync.scores[p.id] ?? 0), 0);
    return { teamId: t.id, name: t.name, hue: t.hue, score, members: members.length };
  });
}

const pointsLabel = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

export const quickDraw = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: { questionTimeSec: 20, questionLimit: 12 },
  action,
  init(ctx) {
    const s: State = { sync: syncInit(ctx), wins: [], penalised: {}, misses: {} };
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p) {
    syncAddPlayer(s, p.id);
  },
  onPlayerLeave(s, _p, ctx) {
    // If everyone still here has had their try, there is nothing left to wait for.
    if (s.sync.phase !== 'question') return;
    const waiting = ctx.players().filter((p) => p.connected);
    if (waiting.length && waiting.every((p) => s.sync.answers[p.id])) syncAdvance(s, cfg, ctx);
  },
  onAction(s, playerId, a, ctx) {
    if (a.iid !== s.sync.iid) return { error: 'That question has closed.' };
    return syncAnswer(s, cfg, playerId, a.answer, ctx);
  },
  onTimer(s, id, ctx) {
    syncOnTimer(s, cfg, id, ctx);
  },
  onHostNext(s, ctx) {
    return syncHostNext(s, cfg, ctx);
  },
  view(s, viewer, ctx) {
    const st = opts(ctx);
    const round = s.sync.round;
    const live = s.sync.phase === 'question' || s.sync.phase === 'reveal';
    const revealed = s.sync.phase === 'reveal';
    const last = s.wins[s.wins.length - 1];
    const roundWin = revealed && last && last.round === round ? last : null;
    const winner = roundWin ? { playerId: roundWin.playerId, name: nameOf(ctx, roundWin.playerId), responseMs: roundWin.responseMs } : null;
    const lockedOut = live ? Object.values(s.sync.answers).filter((a) => !a.correct).length : 0;
    let fastest: { playerId: PlayerId; name: string; responseMs: number } | null = null;
    for (const w of s.wins) if (!fastest || w.responseMs < fastest.responseMs) fastest = { playerId: w.playerId, name: nameOf(ctx, w.playerId), responseMs: w.responseMs };
    let you = null;
    if (viewer.kind === 'player') {
      const me = viewer.playerId;
      const mine = live ? s.sync.answers[me] : undefined;
      you = {
        score: s.sync.scores[me] ?? 0,
        // A correct answer would have ended the round, so a player who answered while it is still open was wrong.
        lockedOut: Boolean(mine && !mine.correct),
        won: winner?.playerId === me,
        lostPoint: live && s.penalised[me] === round,
        wins: s.wins.filter((w) => w.playerId === me).length,
      };
    }
    return {
      sync: syncView(s, cfg, viewer, ctx),
      target: st.target,
      penalty: st.penalty,
      winner,
      lockedOut,
      fastest,
      recent: viewer.kind === 'host' ? s.wins.slice(-5).reverse().map((w) => ({ round: w.round, playerId: w.playerId, name: nameOf(ctx, w.playerId), responseMs: w.responseMs })) : [],
      board: leaderboard(s.sync.scores, s.sync.lastGain, ctx, viewer, viewer.kind === 'host' ? 10 : 5),
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      you,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((p) => {
      const score = s.sync.scores[p.id] ?? 0;
      return { playerId: p.id, score, label: pointsLabel(score) };
    });
    const teams = ctx.teams().length ? teamScores(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: pointsLabel(t.score) })) : undefined;
    const champ = champion(s, ctx);
    return {
      standings,
      ...(teams ? { teamStandings: teams } : {}),
      summary: champ ? `${nameOf(ctx, champ)} reached the target first.` : `${s.wins.length} of ${s.sync.roundsPlayed} rounds were won.`,
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
      const window = Math.max(800, (q.deadline - q.shownAt) * 0.6);
      return 700 + rng.int(0, Math.round(window));
    }
    return 1000;
  },
});
