import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { questionSetInputSchema } from '@ludora/shared';
import { LESSON_SETS } from '../src/lessons/aviation.ts';
import { SETS } from '../src/sets/index.ts';

/** The sets a ready-made lesson uses: valid, with every picture a file that ships with the app. */
const ART = fileURLToPath(new URL('../../../web/public/', import.meta.url));

describe('lesson sets', () => {
  it('have their own seed keys', () => {
    const keys = [...SETS, ...LESSON_SETS].map((s) => s.seedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe.each(LESSON_SETS.map((s) => [s.seedKey, s] as const))('%s', (_key, set) => {
    it('passes the question set schema as an unlisted set', () => {
      const r = questionSetInputSchema.safeParse({ title: set.title, description: set.description, subject: set.subject, gradeBand: set.gradeBand, tags: set.tags, visibility: 'unlisted', cover: set.cover, questions: set.questions });
      expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
    });

    it('describes every picture, and every picture exists', () => {
      const pics = [set.cover.image, ...set.questions.map((q) => q.media)].filter((m) => m !== undefined);
      expect(pics.length).toBeGreaterThan(set.questions.length);
      for (const m of pics) {
        expect(m.alt.length).toBeGreaterThan(10);
        expect(existsSync(resolve(ART, `.${m.url}`)), m.url).toBe(true);
      }
    });

    it('gives every question an explanation to read out at the reveal', () => {
      expect(set.questions.filter((q) => !q.explanation).map((q) => q.id)).toEqual([]);
    });
  });
});
