/*
 * Survival Run: an endless solo run with hearts and a per-question timer that
 * shrinks as the player gets answers right. After each answer the result
 * stays up for a moment (the timer for the next question has not started
 * yet), then the next question appears; the player can also move on sooner.
 * With more than one player every player has an independent run.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { answerText } from '../flashcard-study/answer-text.ts';
import { meta, settings } from './meta.ts';

type Settings = { hearts: number; restores: boolean };

export const START_MS = 15_000;
export const STEP_MS = 500;
export const FLOOR_MS = 6_000;
export const RESTORE_EVERY = 10;
const PAUSE_RIGHT_MS = 1000;
const PAUSE_WRONG_MS = 2500;

interface Runner {
  stream: StreamState;
  hearts: number;
  /** Time allowed for the next question. */
  timerMs: number;
  deadline: number | null;
  phase: 'question' | 'result' | 'over';
  /** In the result phase: when the next question appears. */
  nextAt: number | null;
  restored: number;
  /** Hearts gained (+1) or lost (-1) by the last answer. */
  heartChange: number;
  endedAt: number | null;
}

export interface State {
  runners: Record<PlayerId, Runner>;
  /** Only set when the host chose a time limit; the run is otherwise endless. */
  endsAt: number | null;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('next') }),
]);
type Action = z.infer<typeof action>;

/** The timer after `correct` correct answers: 15 s, half a second less for each, never under 6 s. */
export const timerAfter = (correct: number) => Math.max(FLOOR_MS, START_MS - STEP_MS * correct);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function ask(r: Runner, playerId: PlayerId, ctx: ModeContext<Settings>) {
  streamNext(r.stream, ctx);
  r.phase = 'question';
  r.deadline = ctx.now() + r.timerMs;
  r.nextAt = null;
  ctx.clearTimer(`next:${playerId}`);
  ctx.setTimer(`q:${playerId}`, r.deadline + DEADLINE_GRACE_MS);
}

function newRunner(playerId: PlayerId, ctx: ModeContext<Settings>): Runner {
  const r: Runner = {
    stream: streamInit(ctx, { present: false }),
    hearts: ctx.settings.hearts,
    timerMs: START_MS,
    deadline: null,
    phase: 'question',
    nextAt: null,
    restored: 0,
    heartChange: 0,
    endedAt: null,
  };
  ask(r, playerId, ctx);
  return r;
}

function checkEnd(s: State, ctx: ModeContext) {
  const active = ctx.players().filter((p) => s.runners[p.id]);
  if (active.some((p) => s.runners[p.id]!.phase !== 'over')) return;
  const only = active.length === 1 ? s.runners[active[0]!.id]! : null;
  ctx.endGame(only ? `Out of hearts after ${plural(only.stream.correct, 'correct answer', 'correct answers')}.` : 'Every run has ended.');
}

/** Apply the result of the question that just closed: timer, hearts, then the result pause or the end. */
function settle(s: State, r: Runner, playerId: PlayerId, correct: boolean, ctx: ModeContext<Settings>) {
  ctx.clearTimer(`q:${playerId}`);
  r.deadline = null;
  r.heartChange = 0;
  if (correct) {
    r.timerMs = timerAfter(r.stream.correct);
    if (ctx.settings.restores && r.stream.correct % RESTORE_EVERY === 0 && r.hearts < ctx.settings.hearts) {
      r.hearts++;
      r.restored++;
      r.heartChange = 1;
      if (r.stream.last) r.stream.last.text = 'Heart restored';
    }
  } else {
    r.hearts--;
    r.heartChange = -1;
  }
  if (r.hearts <= 0) {
    r.phase = 'over';
    r.nextAt = null;
    r.endedAt = ctx.now();
    checkEnd(s, ctx);
    return;
  }
  r.phase = 'result';
  r.nextAt = ctx.now() + (correct ? PAUSE_RIGHT_MS : PAUSE_WRONG_MS);
  ctx.setTimer(`next:${playerId}`, r.nextAt);
}

function timeOut(s: State, r: Runner, playerId: PlayerId, ctx: ModeContext<Settings>) {
  const id = r.stream.iid;
  if (!id) return;
  const inst = ctx.questions.instance(id);
  const explanation = ctx.questions.explanation(id);
  r.stream.answered++;
  r.stream.streak = 0;
  r.stream.last = { iid: id, correct: false, partial: 0, reveal: ctx.questions.reveal(id), ...(explanation ? { explanation } : {}), text: 'Out of time' };
  r.stream.iid = null;
  ctx.recordAnswer({ playerId, qid: inst.qid, correct: false, partial: 0, responseMs: ctx.now() - inst.shownAt });
  settle(s, r, playerId, false, ctx);
}

export const survivalRun = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: { timeLimitSec: 0 },
  action,
  init(ctx) {
    const runners: State['runners'] = {};
    for (const p of ctx.players()) runners[p.id] = newRunner(p.id, ctx);
    const endsAt = ctx.common.timeLimitSec > 0 ? ctx.now() + ctx.common.timeLimitSec * 1000 : null;
    if (endsAt !== null) ctx.setTimer('time', endsAt);
    return { runners, endsAt };
  },
  onPlayerJoin(s, p, ctx) {
    s.runners[p.id] ??= newRunner(p.id, ctx);
  },
  onPlayerLeave(s, _p, ctx) {
    checkEnd(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    const r = s.runners[playerId];
    if (!r) return { error: 'You are not in this game.' };
    if (r.phase === 'over') return { error: 'Your run is over.' };
    if (a.type === 'next') {
      if (r.phase !== 'result') return { error: 'Answer this question first.' };
      ask(r, playerId, ctx);
      return;
    }
    if (r.phase !== 'question') return { error: 'There is no question to answer right now.' };
    if (r.deadline !== null && ctx.now() > r.deadline + DEADLINE_GRACE_MS) return { error: 'Time is up for that question.' };
    const res = streamSubmit(r.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    settle(s, r, playerId, res.correct, ctx);
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      ctx.endGame('Time is up.');
      return;
    }
    const playerId = id.slice(id.indexOf(':') + 1);
    const r = s.runners[playerId];
    if (!r) return;
    if (id.startsWith('q:') && r.phase === 'question') timeOut(s, r, playerId, ctx);
    else if (id.startsWith('next:') && r.phase === 'result') ask(r, playerId, ctx);
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const r = me ? s.runners[me] : undefined;
    const last = r && r.phase !== 'question' ? r.stream.last : null;
    return {
      endsAt: s.endsAt,
      maxHearts: ctx.settings.hearts,
      restores: ctx.settings.restores,
      rows: ctx
        .players()
        .filter((p) => s.runners[p.id])
        .map((p) => {
          const run = s.runners[p.id]!;
          return { playerId: p.id, name: p.name, correct: run.stream.correct, hearts: run.hearts, timerMs: run.timerMs, over: run.phase === 'over' };
        })
        .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name)),
      you: r
        ? {
            phase: r.phase,
            hearts: r.hearts,
            timerMs: r.timerMs,
            correct: r.stream.correct,
            answered: r.stream.answered,
            streak: r.stream.streak,
            bestStreak: r.stream.bestStreak,
            restored: r.restored,
            nextHeartIn: ctx.settings.restores ? RESTORE_EVERY - (r.stream.correct % RESTORE_EVERY) : null,
            question: r.phase === 'question' ? streamQuestionView(r.stream, ctx, r.deadline) : null,
            last,
            heartChange: last ? r.heartChange : 0,
            nextAt: r.nextAt,
            lastQuestion: last ? ctx.questions.view(last.iid) : null,
            answerText: last ? answerText(ctx.questions.get(ctx.questions.instance(last.iid).qid)) : null,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const r = s.runners[pl.id];
      const correct = r?.stream.correct ?? 0;
      return { playerId: pl.id, score: correct, label: `${correct.toLocaleString('en-GB')} correct, best streak ${r?.stream.bestStreak ?? 0}` };
    });
    return { standings, summary: 'The run is over.' };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (you?.phase === 'result') return { type: 'next' };
    const q = you?.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    if (view?.you?.phase === 'result') return 600 + rng.int(0, 900);
    // Sometimes slower than the shortest timer, so bots run out of time now and then.
    return 1500 + rng.int(0, 6000);
  },
});
