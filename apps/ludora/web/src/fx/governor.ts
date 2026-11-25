/*
 * The frame-time check for the stage's effects. While effects play it watches how long frames take
 * and asks for less when the device struggles: first fewer pieces, then (on the automatic setting)
 * the plain game for the rest of the visit. It never asks for more. Pure, so it can be tested.
 */

/** Frames slower than this, three in four of them, mean the device is not keeping up (about 36 a second). */
export const SLOW_FRAME_MS = 28;
/** How many frames one verdict looks at: under a second at full speed, so a short burst is enough to tell. */
export const WINDOW = 40;
/** A gap this long is the tab coming back from the background, not a slow frame. */
const GAP_MS = 250;

export type GovernorStep = 'trim' | 'stop';

export class FxGovernor {
  private times: number[] = [];
  private skip = 0;
  /** Share of the budget still drawn: 1, then 0.5. */
  trim = 1;

  constructor(private readonly onStep: (step: GovernorStep) => void) {}

  /** A burst has just started: the first frames after it pay for setting up, so they do not count. */
  settle(frames = 4) {
    this.skip = Math.max(this.skip, frames);
  }

  sample(dtMs: number) {
    if (dtMs > GAP_MS) {
      this.times = [];
      return;
    }
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    this.times.push(dtMs);
    if (this.times.length < WINDOW) return;
    const sorted = this.times.slice().sort((a, b) => a - b);
    // The 75th percentile: one hitch does not count, steady slowness does.
    const p75 = sorted[Math.floor(sorted.length * 0.75)]!;
    this.times = [];
    if (p75 <= SLOW_FRAME_MS) return;
    if (this.trim > 0.5) {
      this.trim = 0.5;
      this.onStep('trim');
    } else this.onStep('stop');
  }
}
