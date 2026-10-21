import { describe, expect, it } from 'vitest';
import type { AnswerRecord } from '@ludora/engine';
import { MAX_REWARDED_QUESTIONS, rewardCounts } from '../src/realtime/persist.ts';

const rec = (qid: string, correct: boolean, kind?: AnswerRecord['kind'], responseMs = 2000): AnswerRecord => ({ playerId: 'p1', qid, correct, partial: correct ? 1 : 0, responseMs, at: 0, ...(kind ? { kind } : {}) });

describe('reward counting', () => {
  it('counts a quiz the obvious way', () => {
    const c = rewardCounts([rec('a', true), rec('b', true), rec('c', false), rec('d', true, undefined, 9000)]);
    expect(c).toMatchObject({ answered: 4, correct: 3, bestStreak: 2, quickCorrect: 2 });
  });

  it('counts each question once however many tries a puzzle took', () => {
    const tries = [rec('a', false, 'attempt'), rec('a', false, 'attempt'), rec('a', true, 'attempt'), rec('b', true, 'attempt'), rec('b', true, 'attempt')];
    const c = rewardCounts(tries);
    expect(c.answered).toBe(2);
    expect(c.correct).toBe(2);
    // Attempts never build streaks or quick-answer quests.
    expect(c.bestStreak).toBe(0);
    expect(c.quickCorrect).toBe(0);
  });

  it('never counts self-graded answers as correct', () => {
    const c = rewardCounts(Array.from({ length: 30 }, (_, i) => rec(`q${i}`, true, 'self')));
    expect(c.answered).toBe(30);
    expect(c.correct).toBe(0);
    expect(c.bestStreak).toBe(0);
  });

  it('caps what one game can pay for', () => {
    const c = rewardCounts(Array.from({ length: 200 }, (_, i) => rec(`q${i}`, true)));
    expect(c.answered).toBe(MAX_REWARDED_QUESTIONS);
    expect(c.correct).toBe(MAX_REWARDED_QUESTIONS);
    expect(c.bestStreak).toBe(200);
  });
});
