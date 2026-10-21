/*
 * TEMPLATE: a complete, minimal self-paced mode. First player to `target`
 * correct answers wins; the game also ends when time runs out.
 *
 * Rules every mode follows (the runtime enforces most of them):
 *  - State is plain data. It is cloned before every hook and thrown away if
 *    the hook returns { error } or throws, so partial changes never leak.
 *  - Time only from ctx.now() (game time; stops while paused).
 *  - Randomness only from ctx.rng (seeded; the conformance test replays games).
 *  - view() never changes state and never contains an unrevealed answer.
 *  - Every answer goes through ctx.questions.grade() (the stream and sync
 *    helpers do this, and record the answer for stats and reports).
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { meta, settings } from './meta.ts';

type Settings = { target: number };

interface State {
  players: Record<PlayerId, { stream: StreamState; score: number }>;
  endsAt: number | null;
}

// Validate every action shape. Anything else is rejected before onAction runs.
const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

export const templateRace = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: { timeLimitSec: 300 },
  action,
  init(ctx) {
    const players: State['players'] = {};
    for (const p of ctx.players()) players[p.id] = { stream: streamInit(ctx), score: 0 };
    const endsAt = ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null;
    if (endsAt) ctx.setTimer('time', endsAt);
    return { players, endsAt };
  },
  // Late joiners need state too; the runtime calls this when someone joins mid-game.
  onPlayerJoin(s, p, ctx) {
    s.players[p.id] ??= { stream: streamInit(ctx), score: 0 };
  },
  onAction(s, playerId, a, ctx) {
    const me = s.players[playerId];
    if (!me) return { error: 'You are not in this game.' };
    const res = streamSubmit(me.stream, playerId, a.iid, a.answer, ctx); // grades, records, sets feedback
    if ('error' in res) return res; // duplicate or stale answers are refused here
    if (res.correct) me.score++;
    if (me.score >= ctx.settings.target) {
      ctx.feed(`${ctx.player(playerId)?.name} reached ${ctx.settings.target}!`, { tone: 'big' });
      ctx.endGame(`${ctx.player(playerId)?.name} got there first.`);
      return;
    }
    streamNext(me.stream, ctx);
  },
  onTimer(_s, id, ctx) {
    if (id === 'time') ctx.endGame('Time is up.');
  },
  view(s, viewer, ctx) {
    const scores = ctx.players().map((p) => ({ playerId: p.id, name: p.name, score: s.players[p.id]?.score ?? 0 }));
    const me = viewer.kind === 'player' ? s.players[viewer.playerId] : undefined;
    return {
      target: ctx.settings.target,
      endsAt: s.endsAt,
      scores: scores.sort((a, b) => b.score - a.score).slice(0, viewer.kind === 'host' ? 40 : 8),
      you: me ? { score: me.score, question: streamQuestionView(me.stream, ctx), last: me.stream.last } : null,
    };
  },
  // Include everyone who played (ctx.everyone) so players who left still get credit.
  results(s, ctx) {
    return {
      standings: ctx.everyone().map((p) => ({ playerId: p.id, score: s.players[p.id]?.score ?? 0, label: `${s.players[p.id]?.score ?? 0} correct` })),
      summary: 'Final scores.',
    };
  },
  // Practice bots and the conformance test drive the game through this.
  bot(view, ctx) {
    const q = view?.you?.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 2000 + rng.int(0, 4000);
  },
});
