import { describe, expect, it } from 'vitest';
import { firstName, photoLayout } from './ClassPhoto.tsx';

describe('class photo', () => {
  it('uses first names only', () => {
    expect(firstName('Bartholomew Fitzgerald-Hughes')).toBe('Bartholomew');
    expect(firstName('  Ana  ')).toBe('Ana');
  });

  it('places everyone inside the picture, front rows bigger, nobody alone at the back', () => {
    for (const n of [1, 5, 8, 13, 30, 60]) {
      const spots = photoLayout(n);
      expect(spots).toHaveLength(n);
      for (const s of spots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size).toBeLessThanOrEqual(1600);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y + s.size).toBeLessThanOrEqual(900);
      }
      expect(spots[spots.length - 1]!.size).toBeGreaterThanOrEqual(spots[0]!.size);
    }
    // 13 players: two rows of 6 and 7, never a Glim alone in a row.
    const ys = photoLayout(13).map((s) => s.y);
    const rows = [...new Set(ys)].map((y) => ys.filter((v) => v === y).length);
    expect(rows).toEqual([6, 7]);
  });
});
