import { describe, expect, it } from 'vitest';
import { SCHOOL_YEARS, isSchoolDress, schoolYearLabel, uniformForDress, yearHasBlazer } from '../src/schoolUniform.ts';
import { schoolDressSchema } from '../src/schoolUniformSchema.ts';

const dress = (year: number | null, blazer: 'green' | 'grey' = 'green', kit: 'school' | 'sport' = 'school') => ({ year, blazer, kit });

describe('school uniforms by year group', () => {
  it('gives no uniform until a year is given', () => {
    expect(uniformForDress(null)).toBeNull();
    expect(uniformForDress(dress(null, 'grey', 'sport'))).toBeNull();
  });

  it('dresses Kindergarten to Year 2 in the red polo, even on sport days and whatever the blazer', () => {
    for (const year of [0, 1, 2]) {
      expect(uniformForDress(dress(year, 'grey'))).toBe('kinder');
      expect(uniformForDress(dress(year, 'green', 'sport'))).toBe('kinder');
    }
  });

  it('dresses Years 3 to 6 in the junior blazers, and the junior sport uniform', () => {
    for (const year of [3, 4, 5, 6]) {
      expect(uniformForDress(dress(year, 'green'))).toBe('junior-green');
      expect(uniformForDress(dress(year, 'grey'))).toBe('junior-grey');
      expect(uniformForDress(dress(year, 'grey', 'sport'))).toBe('sport-junior');
    }
  });

  it('dresses Years 7 to 12 in the senior blazers, and the senior sport uniform', () => {
    for (const year of [7, 8, 9, 10, 11, 12]) {
      expect(uniformForDress(dress(year, 'green'))).toBe('senior-green');
      expect(uniformForDress(dress(year, 'grey'))).toBe('senior-grey');
      expect(uniformForDress(dress(year, 'green', 'sport'))).toBe('sport');
    }
  });

  it('names the years and knows which have a blazer', () => {
    expect(SCHOOL_YEARS.map(schoolYearLabel).slice(0, 3)).toEqual(['Kindergarten', 'Year 1', 'Year 2']);
    expect(schoolYearLabel(12)).toBe('Year 12');
    expect([null, 0, 2, 3, 12].map(yearHasBlazer)).toEqual([false, false, false, true, true]);
  });

  it('accepts only real years, blazers and kits', () => {
    expect(schoolDressSchema.safeParse(dress(7)).success).toBe(true);
    expect(schoolDressSchema.safeParse(dress(13)).success).toBe(false);
    expect(schoolDressSchema.safeParse(dress(-1)).success).toBe(false);
    expect(schoolDressSchema.safeParse(dress(2.5)).success).toBe(false);
    expect(schoolDressSchema.safeParse({ year: 4, blazer: 'blue', kit: 'school' }).success).toBe(false);
  });

  it('checks a choice stored on a device the same way, without zod', () => {
    const cases: unknown[] = [dress(7), dress(null), dress(0, 'grey', 'sport'), dress(13), dress(-1), dress(2.5), { year: 4, blazer: 'blue', kit: 'school' }, { year: 4 }, null, 'Year 4', [dress(3)]];
    for (const c of cases) expect(isSchoolDress(c), JSON.stringify(c)).toBe(schoolDressSchema.safeParse(c).success);
  });
});
