import { describe, expect, it } from 'vitest';
import type { Question } from '@ludora/shared';
import { createRng } from '@ludora/shared';
import { editDistance, gradeAnswer, normalizeAnswerText, shortAnswerMatches } from '../src/questions/grade.ts';
import { answerFromTokens, presentationOrder, revealToTokens, toPublicQuestion } from '../src/questions/present.ts';
import { revealAnswer } from '../src/questions/grade.ts';
import { adaptQuestions } from '../src/questions/adapt.ts';
import { MIXED_SET, FLASHCARD_SET } from '../src/testing/fixtures.ts';

const byId = (id: string) => MIXED_SET.find((q) => q.id === id)!;

describe('normalizeAnswerText', () => {
  it('ignores case, accents, punctuation and leading articles', () => {
    expect(normalizeAnswerText('  The Café!  ')).toBe('cafe');
    expect(normalizeAnswerText('Paris.')).toBe('paris');
  });
  it('keeps the sign of negative numbers', () => {
    expect(normalizeAnswerText('-5')).not.toBe(normalizeAnswerText('5'));
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps', () => {
    expect(editDistance('jupiter', 'jupiter')).toBe(0);
    expect(editDistance('jupiter', 'jupitr')).toBe(1);
    expect(editDistance('jupiter', 'jupiterr')).toBe(1);
    expect(editDistance('jupiter', 'jupoter')).toBe(1);
    expect(editDistance('jupiter', 'jpuiter')).toBe(1);
  });
});

describe('short answers', () => {
  const q = byId('q12') as Extract<Question, { type: 'short' }>;
  it('accepts small typos on longer words', () => {
    expect(shortAnswerMatches(q, 'jupitor')).toBe(true);
    expect(shortAnswerMatches(q, 'saturn')).toBe(false);
  });
  it('never fuzzes numbers', () => {
    const year: Extract<Question, { type: 'short' }> = { id: 'y', type: 'short', prompt: 'Year?', accepted: ['1912'] };
    expect(shortAnswerMatches(year, '1921')).toBe(false);
    expect(shortAnswerMatches(year, '1912')).toBe(true);
  });
  it('respects fuzzy: false', () => {
    expect(shortAnswerMatches({ ...q, fuzzy: false }, 'jupitor')).toBe(false);
  });
  it('rejects empty answers', () => {
    expect(shortAnswerMatches(q, '   ')).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('grades every type', () => {
    expect(gradeAnswer(byId('q1'), { type: 'mcq', choiceId: 'a' }).correct).toBe(true);
    expect(gradeAnswer(byId('q1'), { type: 'mcq', choiceId: 'b' }).correct).toBe(false);
    expect(gradeAnswer(byId('q2'), { type: 'truefalse', value: true }).correct).toBe(true);
    expect(gradeAnswer(byId('q4'), { type: 'numeric', value: 56 }).correct).toBe(true);
    expect(gradeAnswer(byId('q4'), { type: 'numeric', value: 55 }).correct).toBe(false);
    expect(gradeAnswer(byId('q5'), { type: 'order', itemIds: ['atom', 'cell', 'mouse', 'elephant'] }).correct).toBe(true);
    expect(gradeAnswer(byId('q6'), { type: 'match', pairs: { jp: 'jp', ke: 'ke', pe: 'pe' } }).correct).toBe(true);
    expect(gradeAnswer(byId('q8'), { type: 'flashcard', knew: true }).correct).toBe(true);
  });
  it('gives partial credit', () => {
    expect(gradeAnswer(byId('q7'), { type: 'multi', choiceIds: ['a'] })).toEqual({ correct: false, partial: 0.5 });
    expect(gradeAnswer(byId('q7'), { type: 'multi', choiceIds: ['a', 'c'] })).toEqual({ correct: true, partial: 1 });
    expect(gradeAnswer(byId('q7'), { type: 'multi', choiceIds: ['a', 'b'] }).partial).toBe(0);
    expect(gradeAnswer(byId('q5'), { type: 'order', itemIds: ['atom', 'cell', 'elephant', 'mouse'] }).partial).toBe(0.5);
  });
  it('rejects malformed order answers', () => {
    expect(gradeAnswer(byId('q5'), { type: 'order', itemIds: ['atom', 'atom', 'atom', 'atom'] }).correct).toBe(false);
  });
  it('treats a mismatched answer type as wrong', () => {
    expect(gradeAnswer(byId('q1'), { type: 'short', text: 'Mercury' }).correct).toBe(false);
  });
  it('honours numeric tolerance', () => {
    const q: Question = { id: 'pi', type: 'numeric', prompt: 'Pi to 2 dp?', answer: 3.14, tolerance: 0.005 };
    expect(gradeAnswer(q, { type: 'numeric', value: 3.144 }).correct).toBe(true);
    expect(gradeAnswer(q, { type: 'numeric', value: 3.15 }).correct).toBe(false);
  });
});

describe('presentation tokens', () => {
  const rng = createRng(42);
  it('never sends authored ids', () => {
    for (const q of MIXED_SET) {
      const order = presentationOrder(q, rng, true);
      const pub = JSON.stringify(toPublicQuestion(q, order));
      if (q.type === 'mcq' || q.type === 'multi') for (const c of q.choices) expect(pub).not.toContain(`"id":"${c.id}"`);
      if (q.type === 'match') for (const p of q.pairs) expect(pub).not.toContain(`"id":"${p.id}"`);
      if (q.type === 'order') for (const i of q.items) expect(pub).not.toContain(`"id":"${i.id}"`);
    }
  });
  it('assigns tokens by position, so a token says nothing about the answer', () => {
    for (const q of MIXED_SET) {
      const pub = toPublicQuestion(q, presentationOrder(q, rng, true));
      if (pub.type === 'mcq' || pub.type === 'multi') pub.choices.forEach((c, k) => expect(c.id).toBe(`c${k}`));
      if (pub.type === 'order') pub.items.forEach((c, k) => expect(c.id).toBe(`i${k}`));
      if (pub.type === 'match') {
        pub.left.forEach((c, k) => expect(c.id).toBe(`l${k}`));
        pub.right.forEach((c, k) => expect(c.id).toBe(`r${k}`));
      }
    }
  });
  it('never shows ordering or matching questions already solved', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = createRng(seed);
      const order = presentationOrder(byId('q5'), r, false)!;
      expect(order).not.toEqual(['atom', 'cell', 'mouse', 'elephant']);
      const m = presentationOrder(byId('q6'), r, false)!;
      expect(m).not.toEqual(['jp', 'ke', 'pe']);
    }
  });
  it('translates tokens back for grading, and reveals in tokens', () => {
    for (const q of MIXED_SET) {
      const order = presentationOrder(q, rng, true);
      const reveal = revealToTokens(q, order, revealAnswer(q));
      let tokenAnswer: any;
      switch (reveal.type) {
        case 'mcq': tokenAnswer = { type: 'mcq', choiceId: reveal.correct }; break;
        case 'multi': tokenAnswer = { type: 'multi', choiceIds: reveal.correct }; break;
        case 'order': tokenAnswer = { type: 'order', itemIds: reveal.itemIds }; break;
        case 'match': tokenAnswer = { type: 'match', pairs: reveal.pairs }; break;
        default: continue;
      }
      expect(gradeAnswer(q, answerFromTokens(q, order, tokenAnswer)).correct).toBe(true);
    }
  });
  it('grades unknown tokens as wrong', () => {
    const q = byId('q1');
    const order = presentationOrder(q, rng, true);
    expect(gradeAnswer(q, answerFromTokens(q, order, { type: 'mcq', choiceId: 'a' })).correct).toBe(false);
  });
});

describe('adaptQuestions', () => {
  it('turns flashcards and short answers into choice questions when the set has enough answers', () => {
    const r = adaptQuestions(FLASHCARD_SET, ['mcq'], createRng(1));
    expect(r.questions).toHaveLength(FLASHCARD_SET.length);
    for (const q of r.questions) {
      expect(q.type).toBe('mcq');
      if (q.type === 'mcq') expect(q.choices.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('skips what it cannot convert, with a reason', () => {
    const r = adaptQuestions(MIXED_SET, ['mcq'], createRng(2));
    const skippedTypes = new Set(r.skipped.map((s) => s.type));
    expect(skippedTypes.has('order')).toBe(true);
    expect(skippedTypes.has('match')).toBe(true);
    expect(r.skipped.every((s) => s.reason.length > 10)).toBe(true);
    expect(r.questions.every((q) => q.type === 'mcq')).toBe(true);
  });
  it('keeps the correct answer among the choices', () => {
    const r = adaptQuestions(MIXED_SET, ['mcq'], createRng(3));
    const q = r.questions.find((x) => x.id === 'q4');
    expect(q?.type).toBe('mcq');
    if (q?.type === 'mcq') expect(q.choices.find((c) => c.id === q.correct)?.text).toBe('56');
  });
});
