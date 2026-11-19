import { describe, expect, it } from 'vitest';
import { calmUntil } from '../../lib/format.ts';
import { goalLine, todayLine, walletReason, weekLine } from './walletLogic.ts';

describe('wallet words and sums', () => {
  it('says how much of today is earned', () => {
    expect(todayLine(300, 1500)).toEqual({ text: "You have earned 300 of today's 1500 game Sparks. 1200 more to go today.", share: 0.2, reached: false });
    expect(todayLine(1500, 1500).reached).toBe(true);
    expect(todayLine(1600, 1500).share).toBe(1);
    expect(todayLine(10, 0).share).toBe(0);
  });

  it('measures a saving goal', () => {
    expect(goalLine(150, 200, 'Sparks')).toEqual({ text: '50 more Sparks to go.', share: 0.75, ready: false });
    expect(goalLine(250, 200, 'Sparks')).toMatchObject({ ready: true, share: 1 });
  });

  it('names every reason plainly', () => {
    expect(walletReason('class_reward')).toBe('A reward from your teacher');
    expect(walletReason('something_new')).toBe('Something else');
    expect(weekLine(0, 0)).toMatch(/No Sparks/);
    expect(weekLine(120, 300)).toBe('You have earned 120 Sparks so far this week. Last week you earned 300.');
  });
});

describe('calm end dates', () => {
  const now = new Date('2026-11-19T10:00:00Z'); // a Thursday
  it('never counts down', () => {
    expect(calmUntil('2026-11-19T20:00:00Z', now)).toBe('until today');
    expect(calmUntil('2026-11-20T12:00:00Z', now)).toBe('until tomorrow');
    expect(calmUntil('2026-11-23T12:00:00Z', now)).toBe('until Monday');
    expect(calmUntil('2026-12-03T12:00:00Z', now)).toBe('until 3 December');
  });
});
