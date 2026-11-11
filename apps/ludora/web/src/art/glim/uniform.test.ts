import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GlimArt, SchoolUniform } from '@ludora/shared';
import { GLIMS } from '@ludora/content';
import { UNIFORMS, UNIFORM_HAT, uniformFor, uniformSleeve } from './uniform.ts';
import { Glim } from './Glim.tsx';
import { setViewerUniform } from '../../lib/school.ts';

const arts = GLIMS.map((g) => g.art as GlimArt);
const ANY_YEAR = UNIFORMS.filter((u) => u !== 'sport-junior');

describe('the Hills Grammar uniform', () => {
  it('is the same every time for the same Glim, on any device', () => {
    for (const art of arts) expect(uniformFor({ ...art })).toBe(uniformFor(art));
  });

  it('mixes six across the catalogue when no year decides, so a class wears every one', () => {
    const count = Object.fromEntries(ANY_YEAR.map((u) => [u, 0])) as Record<string, number>;
    for (const art of arts) count[uniformFor(art)]!++;
    expect(Object.keys(count).sort()).toEqual([...ANY_YEAR].sort());
    for (const u of ANY_YEAR) expect(count[u], `${u}: ${JSON.stringify(count)}`).toBeGreaterThan(arts.length / 12);
  });

  it('puts Kindergarten and junior sport in the bucket hat, senior sport in the cap, and blazers bare-headed', () => {
    expect(UNIFORM_HAT).toEqual({ 'senior-green': null, 'senior-grey': null, 'junior-green': null, 'junior-grey': null, kinder: 'bucket', sport: 'cap', 'sport-junior': 'bucket' });
  });

  it('gives blazers long sleeves and polos short ones, in the garment colour', () => {
    expect(uniformSleeve('senior-green')).toEqual({ fill: uniformSleeve('junior-green').fill, short: false });
    expect(uniformSleeve('senior-grey').short).toBe(false);
    expect(uniformSleeve('kinder').short).toBe(true);
    expect(uniformSleeve('sport').short).toBe(true);
    expect(uniformSleeve('sport-junior')).toEqual(uniformSleeve('sport'));
    expect(uniformSleeve('kinder').fill).not.toBe(uniformSleeve('sport').fill);
  });
});

describe('who wears which uniform', () => {
  // The Glims below are drawn as on the school's copy, which the server marks on <html>.
  const doc = globalThis as unknown as { document?: unknown };
  const had = 'document' in doc;
  const saved = doc.document;
  doc.document = { documentElement: { dataset: { school: 'hills-grammar' } } };
  afterEach(() => setViewerUniform(null));
  const art = arts[0]!;
  const wears = (props: { dress?: SchoolUniform | null }) => /data-uniform="([^"]+)"/.exec(renderToStaticMarkup(createElement(Glim, { art, size: 96, ...props })))?.[1];

  it('dresses an avatar in its owner’s uniform, whoever is looking', () => {
    setViewerUniform('kinder');
    expect(wears({ dress: 'senior-grey' })).toBe('senior-grey');
  });

  it('gives an avatar whose owner has not said a uniform from its own looks, not the viewer’s', () => {
    setViewerUniform('kinder');
    expect(wears({ dress: null })).toBe(uniformFor(art));
  });

  it('dresses every other Glim in the viewer’s uniform, once they have given their year', () => {
    expect(wears({})).toBe(uniformFor(art));
    setViewerUniform('sport-junior');
    expect(wears({})).toBe('sport-junior');
  });

  it('draws nothing of the kind on any other copy of Ludora', () => {
    (doc.document as { documentElement: { dataset: Record<string, string> } }).documentElement.dataset = {};
    setViewerUniform('kinder');
    expect(wears({ dress: 'senior-green' })).toBeUndefined();
    if (had) doc.document = saved;
    else delete doc.document;
  });
});

describe('the house pin', () => {
  it('sits on a blazer lapel in the house colour, and never on a polo', () => {
    const doc = globalThis as unknown as { document?: unknown };
    const had = 'document' in doc;
    const saved = doc.document;
    doc.document = { documentElement: { dataset: { school: 'hills-grammar' } } };
    const art = arts[0]!;
    const blazer = renderToStaticMarkup(createElement(Glim, { art, dress: 'senior-green', housePin: 120, size: 160 }));
    expect(blazer).toContain('hsl(120 80% 64%)');
    const polo = renderToStaticMarkup(createElement(Glim, { art, dress: 'sport', housePin: 120, size: 160 }));
    expect(polo).not.toContain('hsl(120 80% 64%)');
    const none = renderToStaticMarkup(createElement(Glim, { art, dress: 'senior-green', size: 160 }));
    expect(none).not.toContain('hsl(120 80% 64%)');
    if (had) doc.document = saved;
    else delete doc.document;
  });
});
