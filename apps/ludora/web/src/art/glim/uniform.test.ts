import { describe, expect, it } from 'vitest';
import type { GlimArt } from '@ludora/shared';
import { GLIMS } from '@ludora/content';
import { UNIFORMS, UNIFORM_HAT, uniformFor, uniformSleeve } from './uniform.ts';

const arts = GLIMS.map((g) => g.art as GlimArt);

describe('the Hills Grammar uniform', () => {
  it('is the same every time for the same Glim, on any device', () => {
    for (const art of arts) expect(uniformFor({ ...art })).toBe(uniformFor(art));
  });

  it('mixes all six across the catalogue, so a class wears every one', () => {
    const count = Object.fromEntries(UNIFORMS.map((u) => [u, 0])) as Record<(typeof UNIFORMS)[number], number>;
    for (const art of arts) count[uniformFor(art)]++;
    for (const u of UNIFORMS) expect(count[u], `${u}: ${JSON.stringify(count)}`).toBeGreaterThan(arts.length / 12);
  });

  it('puts Kindergarten in the bucket hat, sport in the cap, and blazers bare-headed', () => {
    expect(UNIFORM_HAT).toEqual({ 'senior-green': null, 'senior-grey': null, 'junior-green': null, 'junior-grey': null, kinder: 'bucket', sport: 'cap' });
  });

  it('gives blazers long sleeves and polos short ones, in the garment colour', () => {
    expect(uniformSleeve('senior-green')).toEqual({ fill: uniformSleeve('junior-green').fill, short: false });
    expect(uniformSleeve('senior-grey').short).toBe(false);
    expect(uniformSleeve('kinder').short).toBe(true);
    expect(uniformSleeve('sport').short).toBe(true);
    expect(uniformSleeve('kinder').fill).not.toBe(uniformSleeve('sport').fill);
  });
});
