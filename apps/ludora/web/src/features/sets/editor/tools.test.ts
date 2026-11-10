import { describe, expect, it } from 'vitest';
import { questionSchema, type Question } from '@ludora/shared';
import { checkHealth } from './health.ts';
import { flashcardsFromPairs, numberBonds, spellingList, timesTables } from './starters.ts';
import { blankDetails, blankQuestion, fromQuestion } from './model.ts';
import { historyReducer, startHistory } from './state.ts';

let seed = 3;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const valid = (qs: Question[]) => qs.every((q) => questionSchema.safeParse(q).success);

describe('starters', () => {
  it('writes times tables questions for the chosen tables, typed or as choices', () => {
    const typed = timesTables({ tables: [3, 7], upTo: 12, style: 'typed', count: 50 }, random);
    expect(typed).toHaveLength(24);
    expect(valid(typed)).toBe(true);
    for (const q of typed) {
      const [a, b] = q.prompt.match(/\d+/g)!.map(Number);
      expect(q.type === 'numeric' && q.answer === a! * b!).toBe(true);
      expect([a, b].some((n) => n === 3 || n === 7)).toBe(true);
    }
    const choices = timesTables({ tables: [6], upTo: 10, style: 'choices', count: 5 }, random);
    expect(choices).toHaveLength(5);
    expect(valid(choices)).toBe(true);
    for (const q of choices) if (q.type === 'mcq') expect(new Set(q.choices.map((c) => c.text)).size).toBe(4);
  });
  it('writes number bonds that add up', () => {
    const qs = numberBonds({ total: 10, style: 'typed', count: 20 }, random);
    expect(qs).toHaveLength(11);
    for (const q of qs) if (q.type === 'numeric') expect(Number(q.prompt.split(' ')[0]) + q.answer).toBe(10);
    expect(valid(numberBonds({ total: 100, style: 'choices', count: 6 }, random))).toBe(true);
  });
  it('turns a spelling list into questions, with the word blanked from its sentence', () => {
    const r = spellingList({ text: 'necessary - It is necessary to sleep.\nrhythm\n\n12345\n', style: 'typed' });
    expect(r.skipped).toEqual(['12345']);
    expect(r.questions[0]).toMatchObject({ type: 'blanks', text: 'It is [necessary] to sleep.' });
    expect(r.questions[1]).toMatchObject({ type: 'short', accepted: ['rhythm'], fuzzy: false });
    const c = spellingList({ text: 'because\nfriend', style: 'choices' }, random);
    expect(valid(c.questions)).toBe(true);
    for (const q of c.questions) if (q.type === 'mcq') expect(q.choices.filter((x) => ['because', 'friend'].includes(x.text))).toHaveLength(1);
  });
  it('makes flashcards from pairs in the usual separators', () => {
    const r = flashcardsFromPairs({ text: 'le chien\tthe dog\nle chat - the cat\nla maison: the house\nnothing here' });
    expect(r.questions.map((q) => (q.type === 'flashcard' ? [q.prompt, q.back] : null))).toEqual([['le chien', 'the dog'], ['le chat', 'the cat'], ['la maison', 'the house']]);
    expect(r.skipped).toEqual(['nothing here']);
  });
});

describe('health check', () => {
  const sample: Question[] = [
    { id: 'a', type: 'mcq', prompt: 'What is 2 + 2?', choices: [{ id: 'x', text: '4' }, { id: 'y', text: 'Five, which is a much longer answer than will ever fit on a phone tile' }], correct: 'x' },
    { id: 'b', type: 'mcq', prompt: 'What is 2+2?', choices: [{ id: 'x', text: '4' }, { id: 'y', text: '3' }], correct: 'x' },
    { id: 'c', type: 'poll', prompt: 'Favourite colour?', choices: [{ id: 'r', text: 'Red' }, { id: 'g', text: 'Green' }] },
  ];
  it('finds duplicates, long answers, pictures with no description and missing answers', () => {
    const drafts = sample.map(fromQuestion);
    drafts.push({ ...blankQuestion('truefalse', 'd'), prompt: 'Is the sky green?' });
    drafts[2] = { ...drafts[2]!, media: { kind: 'image', url: '/uploads/x.png', alt: '' } };
    const h = checkHealth(drafts);
    expect(h.issues.map((i) => i.kind).sort()).toEqual(['answer', 'duplicate', 'long', 'picture']);
    expect(h.issues.find((i) => i.kind === 'duplicate')!.message).toBe('Question 2 repeats question 1.');
  });
  it('says which modes can use the set, and why not the others', () => {
    const h = checkHealth(sample.map(fromQuestion));
    const classic = h.modes.find((m) => m.id === 'classic')!;
    expect(classic.ok).toBe(true);
    expect(classic.shown).toBe(3);
    const gold = h.modes.find((m) => m.id === 'gold-rush')!;
    expect(gold.shown).toBe(2);
    expect(gold.reason).toMatch(/cannot show polls/);
    expect(h.modes.length).toBeGreaterThanOrEqual(26);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes changes, typing in one field as a single step', () => {
    const q = blankQuestion('mcq', 'q1');
    let h = startHistory({ details: blankDetails(), questions: [q], open: {} });
    h = historyReducer(h, { type: 'edit', id: 'q1', change: (d) => ({ ...d, prompt: 'W' }) }, 1000);
    h = historyReducer(h, { type: 'edit', id: 'q1', change: (d) => ({ ...d, prompt: 'Wh' }) }, 1500);
    h = historyReducer(h, { type: 'toggle', id: 'q1' }, 1600);
    h = historyReducer(h, { type: 'add', question: blankQuestion('truefalse', 'q2') }, 5000);
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.questions.map((x) => x.id)).toEqual(['q1']);
    expect(h.present.open.q1).toBe(true);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.questions[0]!.prompt).toBe('');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.questions[0]!.prompt).toBe('Wh');
    h = historyReducer(h, { type: 'editMany', ids: ['q1'], change: (d) => ({ ...d, timeLimit: '30' }) }, 9000);
    expect(h.future).toEqual([]);
  });
});
