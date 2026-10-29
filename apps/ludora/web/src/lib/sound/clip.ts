/** Below this level (0.7 of full scale, about -3.1 dBFS) the master's safety stage leaves sound untouched. */
export const CLIP_KNEE = 0.7;
/** The loudest input the curve covers, as a multiple of full scale (2 is +6 dBFS). Louder input is held at the top. */
export const CLIP_RANGE = 2;

/**
 * The master's safety stage, as a WaveShaper curve: a straight line up to the knee, then a smooth
 * bend (a tanh joined at the same slope) that approaches full scale but never reaches it.
 *
 * One sound alone stays on the straight part, so it comes out exactly as the build made it; only a
 * pile-up of loud sounds is rounded off instead of clipping. A DynamicsCompressor did this before,
 * but it reshaped single sounds (its automatic make-up gain lifted quiet ones more than loud ones,
 * and Firefox's squashed short taps by up to 6 dB), and differently in each browser. This does the
 * same everywhere and adds no gain.
 *
 * The curve spans input from -range to +range: feed it through a gain of 1 / range.
 */
export function softClipCurve(points = 4097, knee = CLIP_KNEE, range = CLIP_RANGE): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = ((i / (points - 1)) * 2 - 1) * range;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  return curve;
}
