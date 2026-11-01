import { describe, expect, it } from 'vitest';
import type { GlimArt } from '@ludora/shared';
import { GLIMS } from '@ludora/content';
import { UNIFORMS, UNIFORM_HAT, uniformFor } from './uniform.ts';

const arts = GLIMS.map((g) => g.art as GlimArt);

describe('the Hills Grammar uniform', () => {
  it('is the same every time for the same Glim, on any device', () => {
    for (const art of arts) expect(uniformFor({ ...art })).toBe(uniformFor(art));
  });

  it('mixes junior, senior and sport across the catalogue, so a class wears all three', () => {
    const count = Object.fromEntries(UNIFORMS.map((u) => [u, 0])) as Record<(typeof UNIFORMS)[number], number>;
    for (const art of arts) count[uniformFor(art)]++;
    for (const u of UNIFORMS) expect(count[u], `${u}: ${JSON.stringify(count)}`).toBeGreaterThan(arts.length / 5);
  });

  it('gives juniors the bucket hat, sport the cap, and seniors no hat with the blazer', () => {
    expect(UNIFORM_HAT).toEqual({ junior: 'bucket', senior: null, sport: 'cap' });
  });
});
