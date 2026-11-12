import { describe, expect, it } from 'vitest';
import { addScore, bump, checkInSummary, lightShares, poolFrom, ranked, SCORE_LIMITS, stopwatchText } from './logic.ts';

describe('check-in', () => {
  it('gives whole shares that add up to 100', () => {
    expect(lightShares({ green: 1, amber: 1, red: 1 })).toEqual({ green: 34, amber: 33, red: 33 });
    expect(lightShares({ green: 0, amber: 0, red: 0 })).toEqual({ green: 0, amber: 0, red: 0 });
    const s = lightShares({ green: 7, amber: 2, red: 4 });
    expect(s.green + s.amber + s.red).toBe(100);
  });
  it('says what to do next', () => {
    expect(checkInSummary({ green: 2, amber: 1, red: 3 })).toMatch(/stuck: worth going over it again/);
    expect(checkInSummary({ green: 8, amber: 1, red: 0 })).toMatch(/ready to move on/);
    expect(checkInSummary({ green: 3, amber: 3, red: 1 })).toBe('43% got it, 43% nearly, 14% stuck.');
    expect(checkInSummary({ green: 0, amber: 0, red: 0 })).toBe('No one counted yet.');
  });
});

describe('scoreboard', () => {
  it('adds rows up to the limit, trims names and refuses empty ones', () => {
    let s = addScore([], '  Table one  ', 'a');
    expect(s).toEqual([{ id: 'a', label: 'Table one', points: 0 }]);
    expect(addScore(s, '   ', 'b')).toHaveLength(1);
    for (let i = 0; i < 20; i++) s = addScore(s, `T${i}`, `x${i}`);
    expect(s).toHaveLength(SCORE_LIMITS.rows);
    expect(addScore([], 'x'.repeat(60), 'c')[0]!.label).toHaveLength(SCORE_LIMITS.label);
  });
  it('adds and takes away points within the limits, and ranks ties together', () => {
    let s = addScore(addScore(addScore([], 'Red', 'r'), 'Blue', 'b'), 'Green', 'g');
    s = bump(bump(s, 'r', 5), 'b', 5);
    s = bump(s, 'g', -3);
    expect(ranked(s).map((x) => `${x.place} ${x.label} ${x.points}`)).toEqual(['1 Blue 5', '1 Red 5', '3 Green -3']);
    expect(bump(s, 'r', 1_000_000).find((x) => x.id === 'r')!.points).toBe(SCORE_LIMITS.points);
  });
});

describe('stopwatch and picker', () => {
  it('reads the stopwatch', () => {
    expect(stopwatchText(0)).toBe('0:00.0');
    expect(stopwatchText(65_349)).toBe('1:05.3');
    expect(stopwatchText(3_725_000)).toBe('1:02:05');
  });
  it('remembers who has been picked this round', () => {
    expect(poolFrom(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    expect(poolFrom(['a', 'b'], ['a', 'b', 'gone'])).toEqual([]);
  });
});
