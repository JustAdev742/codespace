import { MISTAKE_CLEAR_DAYS, createRng, hashString } from '@ludora/shared';

/*
 * The rules of studying, kept free of the database so they are easy to test.
 */

export interface AnswerLike {
  correct: boolean;
  /** 'answer', 'attempt' (one of several tries in a puzzle) or 'self' (self-graded). */
  kind: string;
}

/**
 * Whether a player got one question right in one game, or null when the game says nothing
 * about it. Their first graded answer decides; a puzzle's tries count as right if any try was;
 * self-graded flashcards never count, either way.
 */
export function questionOutcome(records: readonly AnswerLike[]): boolean | null {
  const first = records.find((r) => r.kind === 'answer');
  if (first) return first.correct;
  const tries = records.filter((r) => r.kind === 'attempt');
  if (tries.length) return tries.some((r) => r.correct);
  return null;
}

export interface MistakeState {
  misses: number;
  rightDays: number;
  lastRightDay: string | null;
}

export type MistakeStep =
  | { action: 'none' }
  | { action: 'insert'; next: MistakeState }
  | { action: 'update'; next: MistakeState }
  | { action: 'delete' };

/**
 * What one outcome does to a question on the mistakes list. A wrong answer adds it (or counts
 * another miss and starts the right-answer count again). A right answer counts once per day;
 * the second right day takes it off the list.
 */
export function mistakeStep(current: MistakeState | null, correct: boolean, today: string): MistakeStep {
  if (!correct) {
    if (!current) return { action: 'insert', next: { misses: 1, rightDays: 0, lastRightDay: null } };
    return { action: 'update', next: { misses: current.misses + 1, rightDays: 0, lastRightDay: current.lastRightDay } };
  }
  if (!current) return { action: 'none' };
  if (current.lastRightDay === today) return { action: 'none' };
  const rightDays = current.rightDays + 1;
  if (rightDays >= MISTAKE_CLEAR_DAYS) return { action: 'delete' };
  return { action: 'update', next: { ...current, rightDays, lastRightDay: today } };
}

/** The day's pick from a list, the same for everyone on that day. */
export function dailyPick<T>(list: readonly T[], day: string, salt: string): T | null {
  if (!list.length) return null;
  return list[hashString(`${salt}:${day}`) % list.length]!;
}

/** `count` distinct entries for the day, in a shuffled order that is the same for everyone. */
export function dailySample<T>(list: readonly T[], count: number, day: string, salt: string): T[] {
  return createRng(`${salt}:${day}`).shuffle(list).slice(0, count);
}

/** Days of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export interface SubjectWeek {
  subject: string;
  correct: number;
  answered: number;
}

/** The subject with the biggest rise in accuracy from one week to the next, with enough answers both weeks to mean something. */
export function mostImproved(before: readonly SubjectWeek[], after: readonly SubjectWeek[], minAnswers = 5): { subject: string; from: number; to: number } | null {
  let best: { subject: string; from: number; to: number } | null = null;
  for (const a of after) {
    const b = before.find((x) => x.subject === a.subject);
    if (!b || a.answered < minAnswers || b.answered < minAnswers) continue;
    const from = b.correct / b.answered;
    const to = a.correct / a.answered;
    if (to - from > 0.001 && (!best || to - from > best.to - best.from)) best = { subject: a.subject, from, to };
  }
  return best;
}
