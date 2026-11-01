import type { GlimArt } from '@ludora/shared';

/*
 * The Hills Grammar School's uniform, worn by every Glim on the school's copy of Ludora
 * (SCHOOL_THEME=hills-grammar). Drawn from the school's uniform list (Bob Stewart, 2023):
 * - junior (Kindergarten to Year 6): the bottle-green bucket hat with the crest badge, the red
 *   pullover over a cream shirt, and the junior tie;
 * - senior (Years 7 to 12): the bottle-green blazer with red piping over a cream shirt, and the
 *   green and red striped senior tie;
 * - sport (Years 7 to 12): the bottle-green sports cap with the badge, and the bottle-green polo
 *   with its white and red chest stripes.
 */

export const UNIFORMS = ['junior', 'senior', 'sport'] as const;
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
  return UNIFORMS[(h >>> 0) % UNIFORMS.length]!;
}

/** The hat that goes with each uniform. Seniors wear none with the blazer. */
export const UNIFORM_HAT: Record<Uniform, 'bucket' | 'cap' | null> = { junior: 'bucket', senior: null, sport: 'cap' };
