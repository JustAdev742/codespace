import { describe, expect, it } from 'vitest';
import { questionSetInputSchema } from '@ludora/shared';
import { SETS } from '../src/sets/index.ts';

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('\n');

describe('built-in question library', () => {
  it('has at least 18 sets across at least 10 subjects', () => {
    expect(SETS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(SETS.map((s) => s.subject)).size).toBeGreaterThanOrEqual(10);
  });

  it('uses a unique seedKey for every set', () => {
    const keys = SETS.map((s) => s.seedKey);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  describe.each(SETS.map((s) => [s.seedKey, s] as const))('%s', (_key, set) => {
    it('passes the question set schema', () => {
      const result = questionSetInputSchema.safeParse({
        title: set.title,
        description: set.description,
        subject: set.subject,
        gradeBand: set.gradeBand,
        tags: set.tags,
        visibility: 'public',
        cover: set.cover,
        questions: set.questions,
      });
      // On failure the assertion message lists every schema issue with its path.
      expect(result.success, result.success ? '' : `${set.seedKey} failed validation:\n${issuesOf(result.error)}`).toBe(true);
    });

    it('has at least 20 questions and a title of 80 characters or fewer', () => {
      expect(set.questions.length).toBeGreaterThanOrEqual(20);
      expect(set.title.length).toBeLessThanOrEqual(80);
    });

    it('gives every multiple-choice question at least 3 choices', () => {
      const short = set.questions.filter((q) => q.type === 'mcq' && q.choices.length < 3).map((q) => q.id);
      expect(short).toEqual([]);
    });

    it('never repeats an option within a question', () => {
      const norm = (t: string) => t.trim().toLowerCase();
      const repeated = (texts: string[]) => new Set(texts.map(norm)).size !== texts.length;
      const bad = set.questions
        .filter((q) => {
          if (q.type === 'mcq' || q.type === 'multi') return repeated(q.choices.map((c) => c.text));
          if (q.type === 'order') return repeated(q.items.map((i) => i.text));
          if (q.type === 'match') return repeated(q.pairs.map((p) => p.left)) || repeated(q.pairs.map((p) => p.right));
          return false;
        })
        .map((q) => q.id);
      expect(bad).toEqual([]);
    });
  });
});
