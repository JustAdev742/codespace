import { describe, expect, it } from 'vitest';
import { floorScale, floorsAt, floorsText, heightText } from './tower-layout.ts';

/* Tower Together's floors: a target a child can picture, for any class size, and never out of step with the game. */
describe('floors a child can picture', () => {
  it('puts every class target at 20 to 40 floors', () => {
    // Targets from the game's own rule: 32 for one builder up to 2,156 for 60 (odds.ts targetFloors).
    for (const t of [32, 68, 176, 356, 716, 1076, 1436, 2156, 4000]) {
      const { target } = floorScale(t);
      expect(target, String(t)).toBeGreaterThanOrEqual(20);
      expect(target, String(t)).toBeLessThanOrEqual(40);
    }
    expect(floorScale(32)).toEqual({ per: 1, target: 32 });
  });
  it('shows the target reached exactly when the game says it is reached', () => {
    for (const t of [32, 176, 1076, 2156]) {
      const { target } = floorScale(t);
      for (let h = 0; h <= t * 1.6; h++) expect(floorsAt(h, t) >= target, `${h} of ${t}`).toBe(h >= t);
    }
  });
  it('says amounts in words', () => {
    expect(heightText(1076, 1076)).toBe('40 floors');
    expect(floorsText(2, 1076)).toBe('less than a floor');
    expect(floorsText(54, 1076)).toBe('2 floors');
    expect(floorsText(0, 1076)).toBe('0 floors');
  });
});
