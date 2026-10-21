import type { Answer } from '@ludora/shared';
import { createDeck, draw, type Deck } from '../questions/deck.ts';
import type { FeedbackView, ModeContext, PlayerId, QuestionView } from '../sdk/types.ts';

/*
 * Self-paced questions: every player has their own stream of questions and
 * answers as fast as they like. Modes decide what a correct answer earns.
 * The data for one player lives in a plain object the mode stores wherever
 * it keeps per-player state.
 */

export interface StreamState {
  deck: Deck;
  /** The question on screen, or null while the player is doing something else. */
  iid: string | null;
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
  /** Feedback for the last answer, shown until the next question. */
  last: FeedbackView | null;
}

export function streamInit(ctx: ModeContext, opts: { present?: boolean } = {}): StreamState {
  const s: StreamState = {
    deck: createDeck(ctx.questions.ids(), ctx.rng, ctx.common.shuffleQuestions),
    iid: null,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    last: null,
  };
  if (opts.present !== false) streamNext(s, ctx);
  return s;
}

export function streamNext(s: StreamState, ctx: ModeContext) {
  s.iid = ctx.questions.present(draw(s.deck, ctx.rng));
}

export interface StreamResult {
  correct: boolean;
  partial: number;
  responseMs: number;
  streak: number;
}

/**
 * Grade the current question. Does not move on: call streamNext when the
 * mode is ready for the next question (straight away, or after a choice).
 */
export function streamSubmit(
  s: StreamState,
  playerId: PlayerId,
  iid: string,
  answer: Answer,
  ctx: ModeContext,
): StreamResult | { error: string } {
  if (!s.iid) return { error: 'There is no question to answer right now.' };
  if (iid !== s.iid) return { error: 'That question has already been answered.' };
  const inst = ctx.questions.instance(s.iid);
  const grade = ctx.questions.grade(s.iid, answer);
  const responseMs = ctx.now() - inst.shownAt;
  s.answered++;
  if (grade.correct) {
    s.correct++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else s.streak = 0;
  const explanation = ctx.questions.explanation(s.iid);
  s.last = {
    iid: s.iid,
    correct: grade.correct,
    partial: grade.partial,
    reveal: ctx.questions.reveal(s.iid),
    ...(explanation ? { explanation } : {}),
  };
  ctx.recordAnswer({ playerId, qid: inst.qid, correct: grade.correct, partial: grade.partial, responseMs });
  s.iid = null;
  return { correct: grade.correct, partial: grade.partial, responseMs, streak: s.streak };
}

export function streamQuestionView(s: StreamState, ctx: ModeContext, deadline: number | null = null): QuestionView | null {
  return s.iid ? ctx.questions.view(s.iid, { deadline }) : null;
}
