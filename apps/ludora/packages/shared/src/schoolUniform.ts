/*
 * School uniforms by year group, for a school's own copy of Ludora (SCHOOL_THEME). A player says
 * which year they are in, and on The Hills Grammar School's copy their Glim wears that year's
 * uniform (web/src/art/glim/uniform.tsx draws them). Only the uniform travels with a player's
 * avatar to other players; the year itself stays in the player's own settings.
 *
 * The Hills Grammar School's Uniform Expectations Policy (2025):
 * - Kindergarten to Year 2: the red polo and the bottle-green bucket hat;
 * - Years 3 to 6: the blazer (bottle green or grey) over the red pullover; the junior girls' rounded
 *   collar with the green blazer, the junior boys' argyle tie with the grey;
 * - Years 7 to 12: the blazer (bottle green or grey) with the striped senior tie;
 * - sport: the green polo, under the bucket hat in Years 3 to 6 and the sports cap in Years 7 to 12.
 */

export const SCHOOL_UNIFORMS = ['senior-green', 'senior-grey', 'junior-green', 'junior-grey', 'kinder', 'sport', 'sport-junior'] as const;
export type SchoolUniform = (typeof SCHOOL_UNIFORMS)[number];

/** School years: 0 is Kindergarten, then Years 1 to 12. */
export const SCHOOL_YEARS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** A player's school year, blazer and kit. Validated by schoolDressSchema (schoolUniformSchema.ts). */
export interface SchoolDress {
  /** 0 for Kindergarten, 1 to 12 for Years 1 to 12, null when the player has not said. */
  year: number | null;
  /** Which blazer, from Year 3. */
  blazer: 'green' | 'grey';
  /** The school uniform, or the sport uniform for PE and carnival days. */
  kit: 'school' | 'sport';
}

/** The same check as schoolDressSchema without zod, for the first page load (stored choices on this device). */
export function isSchoolDress(v: unknown): v is SchoolDress {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  const yearOk = d.year === null || (typeof d.year === 'number' && Number.isInteger(d.year) && d.year >= 0 && d.year <= 12);
  return yearOk && (d.blazer === 'green' || d.blazer === 'grey') && (d.kit === 'school' || d.kit === 'sport');
}

export const DEFAULT_SCHOOL_DRESS: SchoolDress = { year: null, blazer: 'green', kit: 'school' };

/** "Kindergarten" or "Year 7". */
export function schoolYearLabel(year: number): string {
  return year === 0 ? 'Kindergarten' : `Year ${year}`;
}

/** The uniform a player in this year wears, or null when they have not given a year. */
export function uniformForDress(dress: SchoolDress | null | undefined): SchoolUniform | null {
  if (!dress || dress.year === null) return null;
  const { year, blazer, kit } = dress;
  // Kindergarten to Year 2 wear the red polo every day, PE included.
  if (year <= 2) return 'kinder';
  if (kit === 'sport') return year <= 6 ? 'sport-junior' : 'sport';
  if (year <= 6) return blazer === 'grey' ? 'junior-grey' : 'junior-green';
  return blazer === 'grey' ? 'senior-grey' : 'senior-green';
}

/** Whether this year has a blazer to choose (Kindergarten to Year 2 wear the polo). */
export const yearHasBlazer = (year: number | null): boolean => year !== null && year >= 3;
