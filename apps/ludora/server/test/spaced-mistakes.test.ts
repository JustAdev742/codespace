import { describe, expect, it } from 'vitest';
import { MISTAKE_REST_DAYS, mistakeDue } from '@ludora/shared';

/*
 * Spaced re-practice of mistakes: when each comes back (mistakeDue in @ludora/shared). The list and
 * the round that use it are tested with the database in students.test.ts.
 */

describe('when a mistake comes back', () => {
  it('is due at once until it has been got right', () => {
    expect(mistakeDue(0, null, '2026-11-26')).toEqual({ due: true, on: '2026-11-26' });
    // Missed again after being right: the count is back to nothing, whatever day it was last right.
    expect(mistakeDue(0, '2026-11-25', '2026-11-26')).toEqual({ due: true, on: '2026-11-26' });
  });

  it('rests after it is got right, then comes back', () => {
    expect(MISTAKE_REST_DAYS).toBe(2);
    expect(mistakeDue(1, '2026-11-26', '2026-11-26')).toEqual({ due: false, on: '2026-11-28' });
    expect(mistakeDue(1, '2026-11-26', '2026-11-27')).toEqual({ due: false, on: '2026-11-28' });
    expect(mistakeDue(1, '2026-11-26', '2026-11-28')).toEqual({ due: true, on: '2026-11-28' });
    expect(mistakeDue(1, '2026-11-26', '2026-12-09')).toEqual({ due: true, on: '2026-11-28' });
  });

  it('counts days across a month and a year', () => {
    expect(mistakeDue(1, '2026-11-30', '2026-12-01').on).toBe('2026-12-02');
    expect(mistakeDue(1, '2026-12-31', '2027-01-01').on).toBe('2027-01-02');
  });
});
