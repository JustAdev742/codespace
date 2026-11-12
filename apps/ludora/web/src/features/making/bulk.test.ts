import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api.ts';
import { runEach } from './bulk.ts';

describe('bulk actions', () => {
  it('runs every item, a few at a time, and keeps the order and each reason', async () => {
    let running = 0;
    let most = 0;
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, label: `Class ${i}` }));
    const r = await runEach(items, async (c) => {
      running++;
      most = Math.max(most, running);
      await new Promise((done) => setTimeout(done, 5));
      running--;
      if (c.id === 'c2') throw new ApiError(409, 'conflict', 'This class is archived.');
      if (c.id === 'c4') throw new TypeError('Failed to fetch');
    });
    expect(most).toBeLessThanOrEqual(3);
    expect(r.map((x) => x.id)).toEqual(items.map((i) => i.id));
    expect(r.filter((x) => x.ok)).toHaveLength(5);
    expect(r[2]).toMatchObject({ ok: false, message: 'This class is archived.' });
    expect(r[4]!.message).toMatch(/Check your connection/);
  });
  it('does nothing with nothing', async () => {
    expect(await runEach([], async () => {})).toEqual([]);
  });
});

import { dayBounds } from './day.ts';
import { answerText } from './questionText.ts';

describe('a day in this device’s time', () => {
  it('runs from midnight to midnight, across the end of a month', () => {
    const r = dayBounds(new Date(2026, 0, 31, 15, 30), 1);
    expect(r.key).toBe('2026-02-01');
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getTime() - r.from.getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(dayBounds(new Date(2026, 2, 1, 0, 5), -1).key).toBe('2026-02-28');
  });
});

describe('answers in a few words', () => {
  it('reads every question type', () => {
    expect(answerText({ id: 'a', type: 'numeric', prompt: 'p', answer: 12, unit: 'cm' })).toBe('12 cm');
    expect(answerText({ id: 'a', type: 'blanks', prompt: 'p', text: 'Plants need [sunlight|light] and [water].' })).toBe('sunlight, water');
    expect(answerText({ id: 'a', type: 'sort', prompt: 'p', groups: [{ id: 'g1', label: 'Fish' }, { id: 'g2', label: 'Birds' }], items: [{ id: 'i1', text: 'cod', group: 'g1' }, { id: 'i2', text: 'owl', group: 'g2' }] })).toBe('Fish: cod; Birds: owl');
    expect(answerText({ id: 'a', type: 'truefalse', prompt: 'p', correct: false })).toBe('False');
  });
});

import { fillSet } from './lessonFromSet.ts';

describe('a lesson from a set', () => {
  it('puts the set into every game step still without one, and leaves the rest alone', () => {
    const steps = fillSet(
      [
        { id: 'a', kind: 'slide', title: 'Hi', lines: [], image: null, note: '' },
        { id: 'b', kind: 'game', title: '', setId: null, modeId: 'classic', variantId: null, settings: {}, common: {}, note: '' },
        { id: 'c', kind: 'game', title: '', setId: '11111111-1111-4111-8111-111111111111', modeId: 'classic', variantId: null, settings: {}, common: {}, note: '' },
      ],
      '22222222-2222-4222-8222-222222222222',
    );
    expect(steps.map((s) => (s.kind === 'game' ? s.setId : null))).toEqual([null, '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111']);
  });
});

import { nextDue } from './next.ts';

describe('the next thing due for a class', () => {
  const now = Date.parse('2026-03-04T12:00:00Z');
  const w = (title: string, dueAt: string | null, started = 0, of = 10) => ({ title, dueAt, started, of });
  it('is the first piece of work due from now', () => {
    expect(nextDue([w('later', '2026-03-09T09:00:00Z'), w('soon', '2026-03-05T09:00:00Z'), w('none', null)], now)?.item.title).toBe('soon');
  });
  it('else the latest one past its date that someone has still to play', () => {
    expect(nextDue([w('old', '2026-02-01T09:00:00Z'), w('recent', '2026-03-03T09:00:00Z'), w('all done', '2026-03-04T09:00:00Z', 10)], now)).toMatchObject({ item: { title: 'recent' }, late: true });
    expect(nextDue([w('all done', '2026-03-01T09:00:00Z', 10), w('none', null)], now)).toBeNull();
  });
});
