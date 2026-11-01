import type { GlimArt } from '@ludora/shared';

/*
 * The Hills Grammar School's uniform, worn by every Glim on the school's copy of Ludora
 * (SCHOOL_THEME=hills-grammar). Drawn from the school's Uniform Expectations Policy (2025) and the
 * photographs of students in uniform on its website:
 * - the bottle-green blazer (girls) and the grey tweed blazer (boys), the crest embroidered on the
 *   breast pocket, over the red V-neck pullover and a cream shirt;
 * - Senior School: the striped tie, green and red with a fine white line, and school pins on the
 *   left lapel;
 * - Junior School: the girls' rounded cream collar without a tie, and the boys' argyle tie;
 * - Kindergarten to Year 2: the red polo with the crest, under the bottle-green bucket hat;
 * - sport, Years 3 to 12: the bottle-green polo with the crest, and the sports cap.
 */

export const UNIFORMS = ['senior-green', 'senior-grey', 'junior-green', 'junior-grey', 'kinder', 'sport'] as const;
export type Uniform = (typeof UNIFORMS)[number];

/** Which uniform a Glim wears: always the same for the same Glim, and a mix across a class. */
export function uniformFor(art: GlimArt): Uniform {
  // FNV-1a over the genome: stable across devices, and every field counts.
  let h = 2166136261;
  const s = JSON.stringify(art);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Finish with an avalanche, so the low bits that pick the uniform depend on every input bit.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return UNIFORMS[(h >>> 0) % UNIFORMS.length]!;
}

/** The hat that goes with each uniform. Blazers go without. */
export const UNIFORM_HAT: Record<Uniform, 'bucket' | 'cap' | null> = {
  'senior-green': null,
  'senior-grey': null,
  'junior-green': null,
  'junior-grey': null,
  kinder: 'bucket',
  sport: 'cap',
};

export const UNIFORM_COLORS = {
  blazerGreen: '#22513e',
  blazerGreenDeep: '#173a2c',
  blazerGrey: '#b7bcbf',
  blazerGreyDeep: '#8d9396',
  pullover: '#d42230',
  pulloverDeep: '#9e1622',
  poloRed: '#d8282f',
  poloRedDeep: '#a51b22',
  poloGreen: '#22573f',
  poloGreenDeep: '#163d2c',
  cream: '#f6f0e1',
} as const;

/** The sleeves: the blazer's or the polo's colour, and whether they stop short of the hand. */
export function uniformSleeve(uniform: Uniform): { fill: string; short: boolean } {
  switch (uniform) {
    case 'senior-green':
    case 'junior-green':
      return { fill: UNIFORM_COLORS.blazerGreen, short: false };
    case 'senior-grey':
    case 'junior-grey':
      return { fill: UNIFORM_COLORS.blazerGrey, short: false };
    case 'kinder':
      return { fill: UNIFORM_COLORS.poloRed, short: true };
    case 'sport':
      return { fill: UNIFORM_COLORS.poloGreen, short: true };
  }
}
