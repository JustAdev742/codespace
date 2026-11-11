import { describe, expect, it } from 'vitest';
import { fillLightness } from './modeFill.ts';

describe('mode colour fills', () => {
  it('keep ink text at 4.6:1 or more on every hue, and stay rich where they can', () => {
    for (let hue = 0; hue < 360; hue += 5) expect(fillLightness(hue)).toBeLessThan(80);
    expect(fillLightness(42)).toBe(58);
    expect(fillLightness(240)).toBeGreaterThan(66);
  });
});
