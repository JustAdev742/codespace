import type { MusicAsset, MusicId } from './assets.generated.ts';

/*
 * A music loop rendered offline, played from its decoded file. The file holds
 * the loop with half a second of the music either side, so jumping from the
 * loop's end back to its start is seamless however the browser's decoder
 * aligns the file. Playback starts at the loop's start, bar 1 beat 1.
 */

export const barSeconds = (a: Pick<MusicAsset, 'bpm' | 'beatsPerBar'>) => (60 / a.bpm) * a.beatsPerBar;

/** The first bar line at or after `t`, for a loop whose bar 1 started at `origin`. */
export function nextBarLine(origin: number, bar: number, t: number): number {
  if (t <= origin) return origin;
  return origin + Math.ceil((t - origin) / bar - 1e-9) * bar;
}

export class LoopPlayer {
  private readonly src: AudioBufferSourceNode;
  /** Two gains, so a fade-out scheduled ahead never fights the fade-in. */
  private readonly fadeIn: GainNode;
  private readonly fadeOut: GainNode;
  private origin = 0;
  private stopped = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    readonly id: MusicId,
    readonly asset: MusicAsset,
    buffer: AudioBuffer,
  ) {
    this.src = ctx.createBufferSource();
    this.src.buffer = buffer;
    this.src.loop = true;
    this.src.loopStart = asset.loopStart;
    this.src.loopEnd = asset.loopEnd;
    this.fadeIn = ctx.createGain();
    this.fadeOut = ctx.createGain();
    this.fadeIn.gain.value = 0;
    this.src.connect(this.fadeIn).connect(this.fadeOut).connect(out);
    this.src.onended = () => this.fadeOut.disconnect();
  }

  /** Starts bar 1 at context time `at`, fading in over `fade` seconds. */
  start(at: number, fade: number) {
    this.origin = at;
    const g = this.fadeIn.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(1, at + Math.max(0.02, fade));
    this.src.start(at, this.asset.loopStart);
  }

  /** The first bar line of this loop at or after context time `t`. */
  nextBar(t: number): number {
    return nextBarLine(this.origin, barSeconds(this.asset), t);
  }

  /** Fades out from context time `at` over `fade` seconds, then stops. */
  stop(at: number, fade: number) {
    if (this.stopped) return;
    this.stopped = true;
    const from = Math.max(at, this.ctx.currentTime);
    const g = this.fadeOut.gain;
    g.setValueAtTime(1, from);
    g.linearRampToValueAtTime(0, from + Math.max(0.02, fade));
    try {
      this.src.stop(from + fade + 0.05);
    } catch {
      // Already stopped.
    }
  }
}
