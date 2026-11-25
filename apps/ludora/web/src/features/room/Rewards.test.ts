import { describe, expect, it } from 'vitest';
import { totalXpForLevel, xpToNext } from '@ludora/shared';
import { levelShare, xpJourney } from './Rewards.tsx';

describe('the level bar on the results', () => {
  it('fills within a level from where it stood to where it stands', () => {
    // Level 1 needs 100 XP. A player on 30 earns 56.
    const j = xpJourney(86, 56);
    expect(j.levelled).toBe(false);
    expect(j.before).toMatchObject({ level: 1, into: 30, needed: 100 });
    expect(j.after).toMatchObject({ level: 1, into: 86, needed: 100 });
    expect(levelShare(j.before)).toBeCloseTo(0.3);
    expect(levelShare(j.after)).toBeCloseTo(0.86);
  });

  it('runs through a level-up: the bar ends part-way along the next level', () => {
    // 80 XP into level 1, then 56 more: 36 into level 2, which needs 150.
    const j = xpJourney(136, 56);
    expect(j.levelled).toBe(true);
    expect(j.before).toMatchObject({ level: 1, into: 80 });
    expect(j.after).toMatchObject({ level: 2, into: 36, needed: xpToNext(2) });
    expect(levelShare(j.after)).toBeCloseTo(36 / 150);
  });

  it('starts a new account from an empty bar, and never from below it', () => {
    expect(xpJourney(56, 56).before).toMatchObject({ level: 1, into: 0 });
    // A total smaller than the gain (it cannot be) still starts at nothing rather than before it.
    expect(xpJourney(10, 56).before).toMatchObject({ level: 1, into: 0 });
    expect(levelShare(xpJourney(0, 0).after)).toBe(0);
  });

  it('shows a full bar at the top level, where there is no more to earn', () => {
    const top = xpJourney(totalXpForLevel(100) + 500, 500);
    expect(top.after.needed).toBe(0);
    expect(levelShare(top.after)).toBe(1);
  });
});
