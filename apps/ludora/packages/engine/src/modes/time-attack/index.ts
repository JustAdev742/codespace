/*
 * Time Attack: a solo score attack against a personal clock. Each run keeps
 * its own end time, which moves earlier with every wrong answer, and its own
 * timer. With more than one player (practice bots, tests) every player has an
 * independent run and the game ends when all of them are over.
 */
import { z } from 'zod';
import { answerSchema } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { DEADLINE_GRACE_MS } from '../../mechanics/syncRounds.ts';
import { answerText } from '../flashcard-study/answer-text.ts';
import { meta, settings } from './meta.ts';

type Settings = { clock: string; penaltySeconds: number; suddenDeath: boolean };

export const BASE_POINTS = 100;
export const STREAK_FOR_BOOST = 5;
export const MAX_MULTIPLIER = 3;

interface Run {
  stream: StreamState;
  startedAt: number;
  /** Game time when the clock reaches zero. Wrong answers move it earlier. */
  endsAt: number;
  score: number;
  multiplier: number;
  /** Correct answers in a row. */
  inRow: number;
  mistakes: number;
  over: 'time' | 'mistake' | null;
  endedAt: number | null;
}

export interface State {
  runs: Record<PlayerId, Run>;
}

const action = z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema });
type Action = z.infer<typeof action>;

/** ×1 for the first five in a row, ×2 for the next five, then ×3. */
export const multiplierFor = (inRow: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(inRow / STREAK_FOR_BOOST));

const clockMs = (ctx: ModeContext<Settings>) => (Number(ctx.settings.clock) || 60) * 1000;
const endTimer = (playerId: PlayerId) => `end:${playerId}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function newRun(playerId: PlayerId, ctx: ModeContext<Settings>): Run {
  const run: Run = {
    stream: streamInit(ctx),
    startedAt: ctx.now(),
    endsAt: ctx.now() + clockMs(ctx),
    score: 0,
    multiplier: 1,
    inRow: 0,
    mistakes: 0,
    over: null,
    endedAt: null,
  };
  // Answers sent just before zero still count: the run closes after a short network grace.
  ctx.setTimer(endTimer(playerId), run.endsAt + DEADLINE_GRACE_MS);
  return run;
}

function endRun(r: Run, playerId: PlayerId, reason: 'time' | 'mistake', ctx: ModeContext) {
  r.over = reason;
  r.endedAt = ctx.now();
  r.stream.iid = null;
  ctx.clearTimer(endTimer(playerId));
}

function checkEnd(s: State, ctx: ModeContext) {
  const active = ctx.players().filter((p) => s.runs[p.id]);
  if (active.some((p) => !s.runs[p.id]!.over)) return;
  const only = active.length === 1 ? s.runs[active[0]!.id]! : null;
  ctx.endGame(only?.over === 'mistake' ? 'One slip ended the run.' : 'The clock has stopped.');
}

export const timeAttack = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: { timeLimitSec: 0 },
  action,
  init(ctx) {
    const runs: State['runs'] = {};
    for (const p of ctx.players()) runs[p.id] = newRun(p.id, ctx);
    return { runs };
  },
  onPlayerJoin(s, p, ctx) {
    s.runs[p.id] ??= newRun(p.id, ctx);
  },
  onPlayerLeave(s, _p, ctx) {
    checkEnd(s, ctx);
  },
  onAction(s, playerId, a, ctx) {
    const r = s.runs[playerId];
    if (!r) return { error: 'You are not in this game.' };
    if (r.over) return { error: 'Your run is over.' };
    if (ctx.now() > r.endsAt + DEADLINE_GRACE_MS) return { error: 'Time is up.' };
    const res = streamSubmit(r.stream, playerId, a.iid, a.answer, ctx);
    if ('error' in res) return res;
    const last = r.stream.last!;
    if (res.correct) {
      const points = BASE_POINTS * r.multiplier;
      const before = r.multiplier;
      r.score += points;
      r.inRow++;
      r.multiplier = multiplierFor(r.inRow);
      last.points = points;
      if (r.multiplier > before) last.text = `×${r.multiplier} multiplier`;
    } else {
      r.inRow = 0;
      r.multiplier = 1;
      r.mistakes++;
      if (ctx.settings.suddenDeath) {
        last.text = 'Run over';
        endRun(r, playerId, 'mistake', ctx);
        checkEnd(s, ctx);
        return;
      }
      const penaltyMs = ctx.settings.penaltySeconds * 1000;
      if (penaltyMs > 0) {
        r.endsAt -= penaltyMs;
        last.text = `−${ctx.settings.penaltySeconds} s`;
        ctx.setTimer(endTimer(playerId), r.endsAt + DEADLINE_GRACE_MS);
      }
    }
    // An answer that arrived in the grace period counts, but no new question starts after zero.
    if (ctx.now() >= r.endsAt) {
      endRun(r, playerId, 'time', ctx);
      checkEnd(s, ctx);
      return;
    }
    streamNext(r.stream, ctx);
  },
  onTimer(s, id, ctx) {
    if (!id.startsWith('end:')) return;
    const playerId = id.slice(4);
    const r = s.runs[playerId];
    if (!r || r.over) return;
    endRun(r, playerId, 'time', ctx);
    checkEnd(s, ctx);
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const r = me ? s.runs[me] : undefined;
    const last = r?.stream.last ?? null;
    return {
      clockMs: clockMs(ctx),
      penaltyMs: ctx.settings.penaltySeconds * 1000,
      suddenDeath: ctx.settings.suddenDeath,
      rows: ctx
        .players()
        .filter((p) => s.runs[p.id])
        .map((p) => {
          const run = s.runs[p.id]!;
          return { playerId: p.id, name: p.name, score: run.score, multiplier: run.multiplier, correct: run.stream.correct, endsAt: run.endsAt, over: run.over };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
      you: r
        ? {
            startedAt: r.startedAt,
            endsAt: r.endsAt,
            over: r.over,
            score: r.score,
            multiplier: r.multiplier,
            inRow: r.inRow,
            nextBoostIn: r.multiplier < MAX_MULTIPLIER ? STREAK_FOR_BOOST - (r.inRow % STREAK_FOR_BOOST) : null,
            correct: r.stream.correct,
            answered: r.stream.answered,
            bestStreak: r.stream.bestStreak,
            mistakes: r.mistakes,
            question: r.over ? null : streamQuestionView(r.stream, ctx, r.endsAt),
            last,
            lastQuestion: last ? ctx.questions.view(last.iid) : null,
            answerText: last ? answerText(ctx.questions.get(ctx.questions.instance(last.iid).qid)) : null,
          }
        : null,
    };
  },
  results(s, ctx) {
    const standings = ctx.everyone().map((pl) => {
      const r = s.runs[pl.id];
      const score = r?.score ?? 0;
      return { playerId: pl.id, score, label: `${plural(score, 'point', 'points')}, ${r?.stream.correct ?? 0} correct` };
    });
    return { standings, summary: 'The clock has stopped.' };
  },
  bot(view, ctx) {
    const q = view?.you?.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(_view, rng) {
    return 1200 + rng.int(0, 2600);
  },
});
