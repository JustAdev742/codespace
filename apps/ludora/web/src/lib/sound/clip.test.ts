import { describe, expect, it } from 'vitest';
import { CLIP_KNEE, CLIP_RANGE, softClipCurve } from './clip.ts';

const curve = softClipCurve();
/** What the WaveShaper does to an input level, after the 1 / CLIP_RANGE gain in front of it. */
function shape(x: number): number {
  const v = Math.max(-1, Math.min(1, x / CLIP_RANGE));
  const pos = ((v + 1) / 2) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(pos));
  return curve[i]! + (curve[i + 1]! - curve[i]!) * (pos - i);
}

describe('the master safety stage', () => {
  it('leaves anything below the knee exactly as it was', () => {
    for (let x = -CLIP_KNEE; x <= CLIP_KNEE; x += 0.0137) expect(shape(x)).toBeCloseTo(x, 6);
    // The loudest effect files peak at -2.5 dBFS, a little over the knee (-3.1 dBFS): the bend
    // takes less than a hundredth of a decibel off them.
    expect(20 * Math.log10(shape(0.75) / 0.75)).toBeGreaterThan(-0.01);
  });

  it('bends smoothly above it, never reaching full scale, and is the same both ways', () => {
    let last = shape(CLIP_KNEE);
    for (let x = CLIP_KNEE + 0.01; x <= CLIP_RANGE + 1; x += 0.01) {
      const y = shape(x);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y).toBeLessThan(1);
      expect(shape(-x)).toBeCloseTo(-y, 6);
      last = y;
    }
    // Joined at the same slope: just above the knee it still follows the line closely.
    expect(shape(CLIP_KNEE + 0.01)).toBeCloseTo(CLIP_KNEE + 0.01, 3);
    // Four loud sounds at once (+3 dBFS) come out just under full scale rather than clipping.
    expect(shape(1.41)).toBeGreaterThan(0.98);
  });
});
