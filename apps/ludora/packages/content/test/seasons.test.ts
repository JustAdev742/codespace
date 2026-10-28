import { describe, expect, it } from 'vitest';
import { activeSeason, CELEBRATIONS, easterSunday, LUNAR_NEW_YEAR, nextCelebration, seasonOf, sydneyDate, sydneyMidnight } from '../src/seasons.ts';

/* Instants are written in UTC; Sydney is 10 hours ahead (11 in daylight saving, October to April). */
const at = (iso: string) => new Date(iso);
const celebrationOn = (iso: string) => activeSeason(at(iso)).celebration?.id ?? null;

describe('Sydney calendar', () => {
  it('reads the date in Sydney, not in UTC', () => {
    // 1:30 pm on New Year's Eve in UTC is already 12:30 am on 1 January in Sydney.
    expect(sydneyDate(at('2026-12-31T13:30:00Z'))).toEqual({ y: 2027, m: 1, d: 1 });
    expect(sydneyDate(at('2026-07-01T13:59:00Z'))).toEqual({ y: 2026, m: 7, d: 1 });
    expect(sydneyDate(at('2026-07-01T14:00:00Z'))).toEqual({ y: 2026, m: 7, d: 2 });
  });

  it('finds Sydney midnight on both sides of daylight saving', () => {
    // Daylight saving starts at 2 am on 4 October 2026, so that midnight is still UTC+10.
    expect(sydneyMidnight({ y: 2026, m: 10, d: 4 }).toISOString()).toBe('2026-10-03T14:00:00.000Z');
    expect(sydneyMidnight({ y: 2026, m: 10, d: 5 }).toISOString()).toBe('2026-10-04T13:00:00.000Z');
    // It ends at 3 am on 5 April 2026, so that midnight is still UTC+11.
    expect(sydneyMidnight({ y: 2026, m: 4, d: 5 }).toISOString()).toBe('2026-04-04T13:00:00.000Z');
    expect(sydneyMidnight({ y: 2026, m: 4, d: 6 }).toISOString()).toBe('2026-04-05T14:00:00.000Z');
    for (const c of [{ y: 2027, m: 1, d: 1 }, { y: 2027, m: 6, d: 30 }, { y: 2028, m: 2, d: 29 }]) {
      expect(sydneyDate(sydneyMidnight(c))).toEqual(c);
      expect(sydneyDate(new Date(sydneyMidnight(c).getTime() - 1))).not.toEqual(c);
    }
  });

  it('works out Easter Sunday', () => {
    expect(easterSunday(2024)).toEqual({ y: 2024, m: 3, d: 31 });
    expect(easterSunday(2025)).toEqual({ y: 2025, m: 4, d: 20 });
    expect(easterSunday(2026)).toEqual({ y: 2026, m: 4, d: 5 });
    expect(easterSunday(2027)).toEqual({ y: 2027, m: 3, d: 28 });
    expect(easterSunday(2038)).toEqual({ y: 2038, m: 4, d: 25 });
  });

  it('puts Science Week and Book Week where they fell in recent years', () => {
    const window = (id: string, y: number) => CELEBRATIONS.find((c) => c.id === id)!.window(y);
    expect(window('science-week', 2024)).toEqual({ start: { y: 2024, m: 8, d: 10 }, end: { y: 2024, m: 8, d: 18 } });
    expect(window('science-week', 2025)).toEqual({ start: { y: 2025, m: 8, d: 9 }, end: { y: 2025, m: 8, d: 17 } });
    expect(window('book-week', 2024)).toEqual({ start: { y: 2024, m: 8, d: 17 }, end: { y: 2024, m: 8, d: 23 } });
    expect(window('book-week', 2025)).toEqual({ start: { y: 2025, m: 8, d: 16 }, end: { y: 2025, m: 8, d: 22 } });
  });

  it('has a Lunar New Year date for every year in its table, all in late January or February', () => {
    for (const [, [m, d]] of Object.entries(LUNAR_NEW_YEAR)) {
      expect(m === 2 || (m === 1 && d >= 20)).toBe(true);
    }
  });
});

describe('seasons', () => {
  it('uses Southern Hemisphere seasons', () => {
    expect(seasonOf({ y: 2026, m: 1, d: 10 }).id).toBe('summer');
    expect(seasonOf({ y: 2026, m: 4, d: 10 }).id).toBe('autumn');
    expect(seasonOf({ y: 2026, m: 7, d: 10 }).id).toBe('winter');
    expect(seasonOf({ y: 2026, m: 10, d: 10 }).id).toBe('spring');
    expect(seasonOf({ y: 2026, m: 12, d: 1 }).id).toBe('summer');
  });

  it('dresses each day in a celebration when there is one, otherwise the season', () => {
    expect(celebrationOn('2026-12-25T02:00:00Z')).toBe('summer-christmas');
    expect(celebrationOn('2026-12-31T02:00:00Z')).toBe('new-year');
    expect(celebrationOn('2026-12-31T13:30:00Z')).toBe('new-year-day');
    expect(celebrationOn('2027-01-26T02:00:00Z')).toBe('australia-day');
    expect(celebrationOn('2026-02-18T02:00:00Z')).toBe('lunar-new-year');
    expect(celebrationOn('2026-03-20T02:00:00Z')).toBe('harmony-week');
    expect(celebrationOn('2026-04-03T02:00:00Z')).toBe('easter');
    expect(celebrationOn('2026-08-10T02:00:00Z')).toBe('science-week');
    expect(celebrationOn('2026-10-30T02:00:00Z')).toBe('spooky-week');
    expect(celebrationOn('2026-07-15T02:00:00Z')).toBeNull();
    expect(celebrationOn('2026-12-28T02:00:00Z')).toBeNull();

    const winter = activeSeason(at('2026-07-15T02:00:00Z'));
    expect(winter.season.id).toBe('winter');
    expect(winter.theme).toBe(winter.season.theme);
    const christmas = activeSeason(at('2026-12-25T02:00:00Z'));
    expect(christmas.theme).toBe(christmas.celebration!.theme);
  });

  it('lets the higher priority win when two overlap', () => {
    // Book Week starts while Science Week is still on.
    expect(celebrationOn('2026-08-16T02:00:00Z')).toBe('book-week');
    // In 2028 Lunar New Year falls on Australia Day.
    expect(celebrationOn('2028-01-26T02:00:00Z')).toBe('australia-day');
    expect(celebrationOn('2028-01-29T02:00:00Z')).toBe('lunar-new-year');
  });

  it('takes a staff override for a year', () => {
    const override = { 'book-week:2026': { start: { y: 2026, m: 8, d: 22 }, end: { y: 2026, m: 8, d: 28 } } };
    expect(activeSeason(at('2026-08-16T02:00:00Z'), override).celebration?.id).toBe('science-week');
    expect(activeSeason(at('2026-08-27T02:00:00Z'), override).celebration?.id).toBe('book-week');
  });

  it('knows what is coming next, across the new year', () => {
    expect(nextCelebration(at('2026-10-28T02:00:00Z'))).toMatchObject({ celebration: { id: 'summer-christmas' }, start: { y: 2026, m: 12, d: 1 } });
    expect(nextCelebration(at('2026-12-31T02:00:00Z'))).toMatchObject({ celebration: { id: 'new-year-day' }, start: { y: 2027, m: 1, d: 1 } });
  });

  it('keeps every celebration small, unique and inside one year', () => {
    const ids = CELEBRATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CELEBRATIONS) {
      expect(c.tagline.length).toBeLessThanOrEqual(80);
      expect(c.theme.decor.length).toBeGreaterThan(0);
      for (const y of [2026, 2027, 2028, 2029, 2030]) {
        const w = c.window(y);
        expect(w.start.y).toBe(y);
        expect(w.end.y).toBe(y);
        expect(w.start.m * 100 + w.start.d).toBeLessThanOrEqual(w.end.m * 100 + w.end.d);
      }
    }
  });
});
