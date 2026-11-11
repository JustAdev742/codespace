import { describe, expect, it } from 'vitest';
import type { LessonStep } from '@ludora/shared';
import { TEMPLATES, languageProblem, lessonPoints, rankTally, stepMinutes, stepTitle } from '../src/modules/lessons/model.ts';
import { lessonBodySchema } from '@ludora/shared';

const standing = (playerId: string, rank: number, correct: number, isBot = false) => ({ playerId, name: playerId, rank, score: 0, label: '', teamId: null, isBot, stats: { correct, answered: 3 } });

describe('lesson points', () => {
  it('counts right answers and the top three places, never bots', () => {
    const points = lessonPoints({ outcome: 'competitive', standings: [standing('a', 1, 3), standing('b', 2, 2), standing('bot', 3, 5, true), standing('c', 4, 0), standing('d', 3, 1)] } as never);
    expect(Object.fromEntries(points)).toEqual({ a: 60, b: 40, c: 0, d: 20 });
  });
  it('gives no places to a player alone, and a bonus to everyone in a won co-op game', () => {
    expect(Object.fromEntries(lessonPoints({ outcome: 'competitive', standings: [standing('a', 1, 2)] } as never))).toEqual({ a: 20 });
    expect(Object.fromEntries(lessonPoints({ outcome: 'coop-win', standings: [standing('a', 1, 2), standing('b', 1, 0)] } as never))).toEqual({ a: 40, b: 20 });
  });
  it('ranks best first, sharing a rank on equal points, marking only the viewer', () => {
    expect(rankTally([{ key: 'x', name: 'Xu', points: 10 }, { key: 'y', name: 'Yan', points: 30 }, { key: 'z', name: 'Al', points: 10 }], 'z')).toEqual([
      { name: 'Yan', points: 30, rank: 1 },
      { name: 'Al', points: 10, rank: 2, mine: true },
      { name: 'Xu', points: 10, rank: 2 },
    ]);
  });
});

describe('estimated length', () => {
  const game = (common: object, modeId = 'classic', variantId: string | null = null): LessonStep => ({ id: 'g', kind: 'game', title: '', setId: null, modeId, variantId, settings: {}, common, note: '' });
  it('works out a game from its questions and settings', () => {
    // Classic: 10 questions of 20 s, host-paced: 10 x 25 s + 10 = 260 s, about 4 minutes, and one to get going.
    expect(stepMinutes(game({ questionLimit: 0 }), 10)).toBe(5);
    // Its own default of 12 questions applies when the step sets none.
    expect(stepMinutes(game({}), 30)).toBe(6);
    // A time limit is the length.
    expect(stepMinutes(game({}, 'gold-rush'), 20)).toBeGreaterThan(1);
    expect(stepMinutes(game({ timeLimitSec: 300 }, 'gold-rush'), 20)).toBe(5);
    // Lightning round: 8 seconds a question.
    expect(stepMinutes(game({ questionLimit: 10 }, 'classic', 'classic-lightning'), 10)).toBe(4);
  });
  it('gives a slide two minutes and a discussion its timer and a minute', () => {
    expect(stepMinutes({ id: 's', kind: 'slide', title: 'Hi', lines: [], image: null, note: '' }, null)).toBe(2);
    expect(stepMinutes({ id: 'd', kind: 'discussion', prompt: 'Why?', seconds: 90, note: '' }, null)).toBe(3);
  });
});

describe('templates and titles', () => {
  it('every template is a valid lesson', () => {
    for (const t of Object.values(TEMPLATES)) expect(lessonBodySchema.safeParse(t.body()).success).toBe(true);
  });
  it('titles a game by its own title, or its mode and set', () => {
    const g: LessonStep = { id: 'g', kind: 'game', title: '', setId: null, modeId: 'classic', variantId: 'classic-lightning', settings: {}, common: {}, note: '' };
    expect(stepTitle(g, 'Fractions')).toBe('Lightning Round: Fractions');
    expect(stepTitle({ ...g, title: 'Starter' }, 'Fractions')).toBe('Starter');
  });
  it('checks everything players read, and not the private note', () => {
    expect(languageProblem({ title: 'Fine', goals: [], steps: [{ id: 'd', kind: 'discussion', prompt: 'shithead', seconds: 60, note: '' }] })?.field).toBe('steps.0');
    expect(languageProblem({ title: 'Fine', goals: [], steps: [{ id: 's', kind: 'slide', title: 'Ok', lines: [], image: { kind: 'image', url: '/uploads/a.png', alt: 'shithead' }, note: '' }] })?.field).toBe('steps.0');
    expect(languageProblem({ title: 'Fine', goals: [], steps: [{ id: 'd', kind: 'discussion', prompt: 'Why?', seconds: 60, note: 'shithead' }] })).toBeNull();
  });
});
