import { useEffect, useRef, useState } from 'react';
import type { FeedbackView, QuestionView } from './types.ts';
import { motionOK } from './stage.tsx';

/*
 * The beat between answers in games where everyone plays at their own pace: the result stays up for a
 * moment, then the next question arrives by itself. A right answer needs a glance. A wrong one is the
 * moment to learn from, so it stays long enough to read why, at a young reader's pace; a player in a
 * hurry presses the button and is on their way.
 */

/** How long each word of an explanation adds to a wrong answer's time on screen (about 180 words a minute). */
export const READ_MS_PER_WORD = 330;
/** The longest a wrong answer stays up by itself. */
export const WRONG_MAX_MS = 7000;

/**
 * How long a result stays up before the next question arrives. `base` is the mode's own pace for a
 * right and a wrong answer; an explanation adds the time it takes to read, up to WRONG_MAX_MS.
 */
export function feedbackMs(correct: boolean, base: { right: number; wrong: number }, explanation?: string | null): number {
  if (correct) return base.right;
  const words = explanation?.trim() ? explanation.trim().split(/\s+/).length : 0;
  return Math.max(base.wrong, Math.min(WRONG_MAX_MS, base.wrong + words * READ_MS_PER_WORD));
}

/**
 * Shows each answer's result for a moment before the next question. Keyed by question id, so frequent
 * view updates from other players neither restart nor cancel the timer, and the reveal is matched to
 * the question answered. `ms` is how long the result on screen stays, for the button's draining bar.
 */
export function useAnswerFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined, base: { right: number; wrong: number }) {
  const asked = useRef(new Map<string, QuestionView>());
  const lastRef = useRef(last);
  const seen = useRef<string | null>(last?.iid ?? null);
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const lastIid = last?.iid ?? null;
  useEffect(() => {
    lastRef.current = last;
  });
  useEffect(() => {
    if (!question) return;
    asked.current.set(question.iid, question);
    if (asked.current.size > 6) asked.current.delete(asked.current.keys().next().value!);
  }, [question]);
  useEffect(() => {
    if (!lastIid || lastIid === seen.current) return;
    seen.current = lastIid;
    setFeedback(lastRef.current ?? null);
  }, [lastIid]);
  const ms = feedback ? feedbackMs(feedback.correct, base, feedback.explanation) : 0;
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(t);
  }, [feedback, ms]);
  return { feedback, ms, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/**
 * The way on from a result: a button to press, with a line along its foot that runs out as the next
 * question gets nearer, so nobody wonders whether to wait or to tap. Give it a `key` per result, so
 * the line starts again each time. Without `ms` it is a plain button; with less motion the line is left out.
 */
export function NextUp({ onClick, ms, label = 'Next question', className = '' }: { onClick: () => void; ms?: number; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press-soft relative isolate min-h-12 w-full overflow-hidden rounded-[var(--radius-m)] bg-white/[0.09] px-5 py-2.5 text-lg font-bold text-text hover:bg-white/[0.14] sm:w-auto sm:min-w-[14rem] sm:self-center ${className}`}
    >
      {label}
      {ms && motionOK() ? <span className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1 origin-left bg-lantern" style={{ animation: `next-drain ${ms}ms linear both` }} aria-hidden /> : null}
    </button>
  );
}
