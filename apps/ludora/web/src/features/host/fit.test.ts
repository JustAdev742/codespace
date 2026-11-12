import { describe, expect, it } from 'vitest';
import { setProfile, type Question } from '@ludora/shared';
import { rankModes, suggestedSettings, type ModeFit } from './fit.ts';

const tf = (i: number, extra: Partial<Question> = {}): Question => ({ id: `q${i}`, type: 'truefalse', prompt: `Statement ${i}`, correct: true, ...extra }) as Question;
const questions = Array.from({ length: 12 }, (_, i) => tf(i, i === 0 ? { sound: { kind: 'bank', id: 'tone-high', caption: 'A high tone' } } : {}));
const fits: ModeFit[] = [
  { id: 'classic', shown: 12, converted: 0, skipped: 0, playable: true, reason: null },
  { id: 'quiz-race', shown: 9, converted: 0, skipped: 3, playable: true, reason: 'This mode cannot show true-or-false questions.' },
  { id: 'lantern-match', shown: 12, converted: 12, skipped: 0, playable: true, reason: null },
  { id: 'sort-it', shown: 0, converted: 0, skipped: 12, playable: false, reason: 'No.' },
];

describe('ranking modes for a set', () => {
  it('puts the best fit first and says why in words', () => {
    const ranked = rankModes(setProfile({ questions }), fits);
    expect(ranked.map((r) => r.id)).toEqual(['classic', 'lantern-match', 'quiz-race', 'sort-it']);
    expect(ranked[0]!.reasons).toEqual(['All 12 questions work', 'Has listening questions: plays them']);
    expect(ranked[1]!.reasons).toEqual(['All 12 questions work, 12 questions in another form', 'Has listening questions: this mode does not play their sounds']);
    expect(ranked[2]!.reasons[0]).toBe('3 questions will be left out');
    expect(ranked[3]).toMatchObject({ playable: false, reasons: ['Cannot show any of these questions'] });
  });

  it('lists the modes the author made the set for first', () => {
    const ranked = rankModes(setProfile({ questions, defaults: { modes: ['quiz-race'] } }), fits);
    expect(ranked[0]).toMatchObject({ id: 'quiz-race', madeFor: true });
    expect(ranked[0]!.reasons[0]).toBe('Made for this set');
  });

  it('fills in time per question from the author’s reading time, or from the questions', () => {
    expect(suggestedSettings(setProfile({ questions, defaults: { readingTime: 'long', randomCount: 5 } }))).toMatchObject({ questionTimeSec: 30, questionLimit: 5 });
    const s = suggestedSettings(setProfile({ questions }));
    expect(s.questionTimeSec).toBe(setProfile({ questions }).autoQuestionSec);
    expect(s.why).toMatch(/how long its questions are/);
  });
});

describe('modes that need more questions', () => {
  it('says how many a mode needs when the set is simply too short', () => {
    const ranked = rankModes(setProfile({ questions: questions.slice(0, 4) }), [{ id: 'big', shown: 4, converted: 0, skipped: 0, playable: false, min: 10, reason: null }]);
    expect(ranked[0]!.reasons).toEqual(['Needs at least 10 questions; this set has 4']);
  });
});
