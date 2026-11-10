import { describe, expect, it } from 'vitest';
import { achievementCategory, nearlyThere } from './groups.ts';

describe('achievement kinds', () => {
  it('sorts each metric into a kind, and unknown ones into playing', () => {
    expect(achievementCategory('games_won')).toBe('winning');
    expect(achievementCategory('glims_owned')).toBe('collecting');
    expect(achievementCategory('level')).toBe('levels');
    expect(achievementCategory('something_new')).toBe('playing');
  });

  it('nearly there: unearned, at least half done, closest first, three at most', () => {
    const a = (id: string, progress: number, target: number, unlockedAt: string | null = null) => ({ id, progress, target, unlockedAt });
    const list = [a('half', 5, 10), a('most', 9, 10), a('done', 10, 10, '2026-01-01'), a('little', 1, 10), a('close', 18, 20), a('also', 7, 10)];
    expect(nearlyThere(list).map((x) => x.id)).toEqual(['most', 'close', 'also']);
    expect(nearlyThere([a('none', 0, 0)])).toEqual([]);
  });
});
