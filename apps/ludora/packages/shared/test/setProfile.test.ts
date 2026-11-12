import { describe, expect, it } from 'vitest';
import { questionLayout, questionSchema, questionSetInputSchema, readingChars, setProfile, suggestedQuestionSec, type Question } from '../src/index.ts';

const mcq = (id: string, prompt: string, extra: Partial<Question> = {}): Question =>
  ({ id, type: 'mcq', prompt, choices: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correct: 'a', ...extra }) as Question;

describe('set profile', () => {
  const questions: Question[] = [
    mcq('q1', 'Short?', { difficulty: 'hard', tags: ['birds'], hint: 'Think' }),
    mcq('q2', 'Which one?', { media: { kind: 'image', url: '/uploads/abc.png', alt: 'A bird' } }),
    mcq('q3', 'Listen. Which bird is it?', { sound: { kind: 'bank', id: 'tone-high', caption: 'A high tone' }, difficulty: 'hard', tags: ['birds', 'sound'] }),
    { id: 'q4', type: 'numeric', prompt: 'How many legs does a spider have?', answer: 8 },
    { id: 'q5', type: 'short', prompt: 'x'.repeat(300), accepted: ['y'] },
  ];
  const p = setProfile({ questions, defaults: { readingTime: 'auto', modes: ['classic'], shuffleAnswers: true, feel: { right: 'note-c5', backdrop: 'aurora', accent: 200 } } });

  it('counts the mix of types, pictures, sounds and numbers', () => {
    expect(p.count).toBe(5);
    expect(p.types).toEqual({ mcq: 3, numeric: 1, short: 1 });
    expect(p.pictures).toBe(1);
    expect(p.sounds).toBe(1);
    expect(p.listening).toBe(1);
    expect(p.numeric).toBe(1);
    expect(p.hints).toBe(1);
    expect(p.difficulty).toEqual({ easy: 0, medium: 0, hard: 2, unset: 3 });
    expect(p.tags).toEqual({ birds: 2, sound: 1 });
  });

  it('measures reading', () => {
    expect(p.readMax).toBe(300);
    expect(p.longReads).toBe(1);
    expect(readingChars(questions[0]!)).toBe('Short?'.length + 5);
    expect(p.answerMax).toBe(3);
  });

  it('carries the author’s feel and play choices', () => {
    expect(p.feel).toEqual({ right: 'note-c5', backdrop: 'aurora', accent: 200 });
    expect(p.play).toEqual({ readingTime: 'auto', readingChosen: true, shuffleAnswers: true, modes: ['classic'], randomCount: null });
    expect(setProfile({ questions }).play.readingChosen).toBe(false);
    expect(setProfile({ questions }).autoQuestionSec).toBe(p.questionSec);
  });

  it('suggests a time per question from the reading time choice', () => {
    expect(suggestedQuestionSec(questions, 'short')).toBe(15);
    expect(suggestedQuestionSec(questions, 'normal')).toBe(20);
    expect(suggestedQuestionSec(questions, 'long')).toBe(30);
    const quick = suggestedQuestionSec([mcq('a', 'Yes?'), mcq('b', 'No?'), mcq('c', 'Hm?')], 'auto');
    expect(quick).toBe(10);
    const wordy = suggestedQuestionSec(Array.from({ length: 4 }, (_, i) => mcq(`w${i}`, 'w'.repeat(400))), 'auto');
    expect(wordy).toBeGreaterThan(30);
    expect(wordy).toBeLessThanOrEqual(60);
    expect(p.questionSec % 5).toBe(0);
  });

  it('is empty-safe', () => {
    const e = setProfile({ questions: [] });
    expect(e.count).toBe(0);
    expect(e.readMean).toBe(0);
    expect(e.play.readingTime).toBe('normal');
  });

  it('picks a layout from the question', () => {
    expect(questionLayout(questions[2]!)).toBe('listen');
    expect(questionLayout(questions[1]!)).toBe('picture');
    expect(questionLayout(questions[4]!)).toBe('long');
    expect(questionLayout(questions[0]!)).toBe('plain');
  });
});

describe('sound in the schema', () => {
  it('needs a caption on every sound', () => {
    expect(questionSchema.safeParse(mcq('a', 'Hi', { sound: { kind: 'bank', id: 'note-c4', caption: '' } as never })).success).toBe(false);
    expect(questionSchema.safeParse(mcq('a', 'Hi', { sound: { kind: 'bank', id: 'note-c4', caption: 'Middle C' } })).success).toBe(true);
  });

  it('takes clips only from Ludora’s own uploads, as WAV, up to the length limit', () => {
    const clip = (url: string, seconds: number) => questionSchema.safeParse(mcq('a', 'Hi', { sound: { kind: 'clip', url, seconds, caption: 'A clip' } })).success;
    expect(clip(`/uploads/${'a'.repeat(32)}.wav`, 5)).toBe(true);
    expect(clip('https://example.com/a.wav', 5)).toBe(false);
    expect(clip(`/uploads/${'a'.repeat(32)}.mp3`, 5)).toBe(false);
    expect(clip(`/uploads/${'a'.repeat(32)}.wav`, 21)).toBe(false);
  });

  it('refuses an unknown bank sound or language', () => {
    expect(questionSchema.safeParse(mcq('a', 'Hi', { sound: { kind: 'bank', id: 'nope', caption: 'x' } as never })).success).toBe(false);
    expect(questionSchema.safeParse(mcq('a', 'Hi', { sound: { kind: 'speech', text: 'hola', lang: 'xx-XX', caption: 'x' } as never })).success).toBe(false);
  });

  it('lets a choice be a sound alone', () => {
    const q = { id: 'q', type: 'mcq', prompt: 'Which is higher?', choices: [{ id: 'a', text: '', sound: { kind: 'bank', id: 'note-c5', caption: 'First note' } }, { id: 'b', text: '', sound: { kind: 'bank', id: 'note-c4', caption: 'Second note' } }], correct: 'a' };
    expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it('keeps the feel and play choices on a set, and refuses more than two modes', () => {
    const base = { title: 'T', subject: 'music', questions: [mcq('a', 'Hi')] };
    expect(questionSetInputSchema.safeParse({ ...base, defaults: { readingTime: 'long', modes: ['classic', 'survival-run'], feel: { win: 'fx-fanfare', backdrop: 'forest', accent: 10 } } }).success).toBe(true);
    expect(questionSetInputSchema.safeParse({ ...base, defaults: { modes: ['a', 'b', 'c'] } }).success).toBe(false);
    expect(questionSetInputSchema.safeParse({ ...base, defaults: { feel: { backdrop: 'space' } } }).success).toBe(false);
  });
});
