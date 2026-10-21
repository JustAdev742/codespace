import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import {
  leaderboard,
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
import { meta, settings } from './meta.ts';

type Settings = {
  speedBonus: boolean;
  streakBonus: boolean;
  autoAdvance: boolean;
  leaderboard: boolean;
  scale: string;
  suddenDeath: boolean;
};

interface State {
  sync: SyncState;
  /** Round in which each knocked-out player went out (sudden death). */
  out: Record<PlayerId, number>;
  startedWith: number;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

export function classicPoints(r: { correct: boolean; partial: number; responseMs: number; limitMs: number; streak: number }, opts: { speedBonus: boolean; streakBonus: boolean; scale: number }): number {
  const credit = r.correct ? 1 : r.partial >= 0.5 ? r.partial : 0;
  if (credit === 0) return 0;
  const speedShare = opts.speedBonus ? Math.max(0, 1 - r.responseMs / Math.max(1, r.limitMs)) : 1;
  const streak = opts.streakBonus && r.correct ? Math.min(5, Math.max(0, r.streak - 1)) * 50 : 0;
  const raw = (500 + 500 * speedShare) * credit + streak;
  return Math.round((raw * opts.scale) / 10) * 10;
}

const isOut = (s: State, id: PlayerId) => s.out[id] !== undefined;

const cfg: SyncConfig<State> = {
  introMs: 4000,
  revealMs: 5000,
  leaderboardMs: 5000,
  autoAdvance: (_s, ctx) => (ctx.settings as Settings).autoAdvance,
  showLeaderboard: (_s, ctx) => (ctx.settings as Settings).leaderboard,
  canAnswer: (s, id) => !isOut(s, id),
  score: (_s, _id, r, ctx) => {
    const st = ctx.settings as Settings;
    return classicPoints(r, { speedBonus: st.speedBonus, streakBonus: st.streakBonus, scale: Number(st.scale) || 1 });
  },
  onClosed: (s, ctx) => {
    if (!(ctx.settings as Settings).suddenDeath) return;
    for (const p of ctx.players()) {
      if (isOut(s, p.id)) continue;
      const a = s.sync.answers[p.id];
      if (!a || !a.correct) {
        s.out[p.id] = s.sync.round;
        ctx.feed(`${p.name} is out.`, { tone: 'bad' });
      }
    }
  },
  isOver: (s, ctx) => {
    if (!(ctx.settings as Settings).suddenDeath) return false;
    const alive = ctx.players().filter((p) => !isOut(s, p.id)).length;
    return alive === 0 || (s.startedWith > 1 && alive <= 1);
  },
  onFinished: (s, ctx) => {
    if ((ctx.settings as Settings).suddenDeath) {
      const alive = ctx.players().filter((p) => !isOut(s, p.id));
      if (alive.length === 1) ctx.endGame(`${alive[0]!.name} is the last one standing.`);
      else if (alive.length === 0) ctx.endGame('Nobody survived the last question. Scores decide it.');
      else ctx.endGame(`${alive.length} players survived every question.`);
      return;
    }
    ctx.endGame('That was the last question.');
  },
};

function teamScores(s: State, ctx: ModeContext) {
  return ctx.teams().map((t) => {
    const members = ctx.players().filter((p) => p.teamId === t.id);
    const total = members.reduce((n, p) => n + (s.sync.scores[p.id] ?? 0), 0);
    const avg = members.length ? Math.round(total / members.length) : 0;
    return { teamId: t.id, name: t.name, hue: t.hue, score: avg, members: members.length };
  });
}

export const classic = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const s: State = { sync: syncInit(ctx), out: {}, startedWith: ctx.players().length };
    syncBegin(s, cfg, ctx);
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    syncAddPlayer(s, p.id);
    // Late joiners in sudden death would have dodged earlier questions, so they watch instead.
    if (ctx.settings.suddenDeath && s.sync.round >= 0) s.out[p.id] ??= -1;
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
    const st = ctx.settings as Settings;
    const board = leaderboard(s.sync.scores, s.sync.lastGain, ctx, viewer, viewer.kind === 'host' ? 10 : 5);
    return {
      sync: syncView(s, cfg, viewer, ctx),
      board,
      teams: ctx.teams().length ? teamScores(s, ctx) : null,
      suddenDeath: st.suddenDeath,
      alive: st.suddenDeath ? ctx.players().filter((p) => !isOut(s, p.id)).length : null,
      out: viewer.kind === 'player' ? isOut(s, viewer.playerId) : false,
      score: viewer.kind === 'player' ? (s.sync.scores[viewer.playerId] ?? 0) : null,
    };
  },
  results(s, ctx) {
    const st = ctx.settings as Settings;
    const standings = ctx.everyone().map((p) => {
      const score = s.sync.scores[p.id] ?? 0;
      if (!st.suddenDeath) return { playerId: p.id, score, label: `${score.toLocaleString('en-US')} pts` };
      // Survivors rank above everyone who went out; later exits rank above earlier ones.
      const outRound = s.out[p.id];
      const survivalBonus = outRound === undefined ? 1_000_000_000 : (outRound + 1) * 1_000_000;
      return {
        playerId: p.id,
        score: survivalBonus + score,
        label: outRound === undefined ? `Survived, ${score.toLocaleString('en-US')} pts` : outRound < 0 ? 'Joined late' : `Out on question ${outRound + 1}`,
      };
    });
    const teams = ctx.teams().length ? teamScores(s, ctx).map((t) => ({ teamId: t.teamId, score: t.score, label: `${t.score.toLocaleString('en-US')} avg` })) : undefined;
    return { standings, ...(teams ? { teamStandings: teams } : {}), summary: 'Final scores.' };
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
