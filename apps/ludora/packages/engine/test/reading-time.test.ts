import { describe, expect, it } from 'vitest';
import { readingGraceMs, type Question } from '@ludora/shared';
import { READING_SHARE_MAX, speedClock } from '../src/mechanics/syncRounds.ts';
import { toPublicQuestion } from '../src/questions/present.ts';
import { adaptQuestions } from '../src/questions/adapt.ts';
import { createRng } from '@ludora/shared';
import { classic } from '../src/modes/classic/index.ts';
import { drive, MCQ } from './rule-helpers.ts';

/*
 * Reading time: in modes that reward speed, a long question (or one with a sound to hear)
 * gives players time to read it before the clock starts to count against them.
 */

const LONG_PROMPT = `${'A long question that takes a while to read through carefully, '.repeat(4)}which is right?`;
const longSet: Question[] = MCQ.map((q) => ({ ...q, prompt: LONG_PROMPT }));
const SPEED = { speedBonus: true, streakBonus: false, leaderboard: false };
const LIMIT = 20_000;

describe('reading time before speed counts', () => {
  it('gives short questions none and long ones some, never more than the cap', () => {
    expect(readingGraceMs(MCQ[0]!)).toBe(0);
    const g = readingGraceMs(longSet[0]!);
    expect(g).toBeGreaterThan(3000);
    expect(g).toBeLessThanOrEqual(9000);
    const huge: Question = { ...longSet[0]!, prompt: 'x'.repeat(500) } as Question;
    expect(readingGraceMs(huge)).toBe(9000);
  });

  it('counts a clip’s length as reading time', () => {
    const q: Question = { ...MCQ[0]!, sound: { kind: 'clip', url: `/uploads/${'a'.repeat(32)}.wav`, seconds: 4, caption: 'A bird call' } } as Question;
    expect(readingGraceMs(q)).toBe(4000);
  });

  it('takes the reading time off the clock speed scoring sees, at most a share of the limit', () => {
    const q = longSet[0]!;
    const grace = readingGraceMs(q);
    expect(speedClock(q, grace - 100, LIMIT)).toEqual({ responseMs: 0, limitMs: LIMIT - grace });
    expect(speedClock(MCQ[0]!, 5000, LIMIT)).toEqual({ responseMs: 5000, limitMs: LIMIT });
    // A 10-second limit keeps at least 60% of it for racing.
    expect(speedClock(q, 0, 10_000).limitMs).toBe(10_000 - Math.min(grace, 10_000 * READING_SHARE_MAX));
  });

  it('scores an answer given while still reading a long question as fully fast', () => {
    const run = (questions: Question[]) => {
      const h = drive(classic, { players: ['a', 'b'], settings: SPEED, questions });
      h.tick(4000);
      h.answer('a', 'right');
      h.wait(3000);
      h.answer('b', 'right');
      return [h.view('a').score, h.view('b').score] as const;
    };
    const [shortA, shortB] = run(MCQ);
    expect(shortB).toBeLessThan(shortA);
    const [longA, longB] = run(longSet);
    // Both answered inside the reading time: the same, top score.
    expect(longB).toBe(longA);
    expect(longA).toBe(shortA);
  });

  it('still rewards the quicker of two answers after the reading time', () => {
    const h = drive(classic, { players: ['a', 'b'], settings: SPEED, questions: longSet });
    h.tick(4000);
    h.wait(readingGraceMs(longSet[0]!) + 2000);
    h.answer('a', 'right');
    h.wait(4000);
    h.answer('b', 'right');
    expect(h.view('a').score).toBeGreaterThan(h.view('b').score);
  });
});

describe('sound and hints reach players', () => {
  const speech = { kind: 'speech' as const, text: 'bonjour', lang: 'fr-FR' as const, caption: 'A French greeting is said aloud' };
  it('sends a question’s sound and hint, and a choice’s sound, in the public question', () => {
    const q: Question = { ...MCQ[0]!, sound: speech, hint: 'It is said in the morning', choices: MCQ[0]!.type === 'mcq' ? MCQ[0]!.choices.map((c, i) => (i === 0 ? { ...c, sound: { kind: 'bank' as const, id: 'note-c4' as const, caption: 'Middle C' } } : c)) : [] } as Question;
    const p = toPublicQuestion(q, null);
    expect(p.sound).toEqual(speech);
    expect(p.hint).toBe('It is said in the morning');
    expect(p.type === 'mcq' && p.choices[0]!.sound?.kind).toBe('bank');
  });

  it('keeps the sound when a mode turns the question into another type', () => {
    const q: Question = { id: 'f1', type: 'flashcard', prompt: 'Type what you hear', back: 'bonjour', sound: speech, hint: 'A greeting' };
    const r = adaptQuestions([q], ['short'], createRng(1));
    expect(r.questions[0]!.type).toBe('short');
    expect(r.questions[0]!.sound).toEqual(speech);
    expect(r.questions[0]!.hint).toBe('A greeting');
  });
});
