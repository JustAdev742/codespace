import { SFX_ASSETS, type SfxAsset, type SfxAssetName } from './assets.generated.ts';
import type { SfxName, SfxOptions } from './sfx.ts';

/*
 * The recorded sounds: effects and music rendered offline (tools/audio) and
 * shipped as MP3s. A file is fetched once and decoded once per audio context.
 * Until an effect's file is ready, the engine plays the synthesised version
 * from sfx.ts instead, so nothing is ever silent while it loads.
 */

/** A decoded file, and how far into it the sound starts (decoders can leave a few milliseconds of silence). */
export interface Sample {
  buffer: AudioBuffer;
  lead: number;
}

/** The effect file for an effect name; families (joins, reactions, board steps, reveals) pick a file by `n` or rarity. */
export function sampleFor(name: SfxName, o: SfxOptions = {}): SfxAssetName | null {
  const pick = (count: number) => (((o.n ?? 0) % count) + count) % count;
  let key: string;
  if (name === 'join') key = `join-${pick(8)}`;
  else if (name === 'reaction') key = `reaction-${pick(4)}`;
  else if (name === 'step') key = `step-${pick(6)}`;
  else if (name === 'lanternReveal') key = `lanternReveal-${o.rarity ?? 'common'}`;
  else key = name;
  return key in SFX_ASSETS ? (key as SfxAssetName) : null;
}

export const sfxAsset = (key: SfxAssetName): SfxAsset => SFX_ASSETS[key];

/** Effects heard in nearly every game, fetched first. */
export const CORE_SFX: SfxAssetName[] = ['tap', 'select', 'lockIn', 'correct', 'wrong', 'tick', 'tickFinal', 'timeUp', 'question', 'reveal', 'rankUp', 'countdown', 'go', 'fanfare'];

/** Seconds of near-silence at the start of a buffer: the first sample louder than -60 dB of full scale. */
export function leadingSilence(buffer: AudioBuffer, limit = 0.08): number {
  const threshold = 0.001;
  const end = Math.min(buffer.length, Math.round(limit * buffer.sampleRate));
  let first = end;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < first; i++) {
      if (Math.abs(data[i]!) > threshold) {
        first = i;
        break;
      }
    }
  }
  // Start a millisecond early so the attack is never clipped.
  return first >= end ? 0 : Math.max(0, first / buffer.sampleRate - 0.001);
}

/**
 * Fetches and decodes files. The bytes can be fetched before an audio context
 * exists (to have the music ready by the time someone presses Start); decoding
 * waits for the context.
 */
export class SampleBank {
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<string, Promise<Sample | null>>();
  private readonly ready = new Map<string, Sample>();
  private ctx: BaseAudioContext | null = null;

  attach(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  /** The decoded file if it is ready now, otherwise null. */
  get(url: string): Sample | null {
    return this.ready.get(url) ?? null;
  }

  /** Fetches the file's bytes without decoding them. Safe to call often. */
  prefetch(url: string): Promise<ArrayBuffer | null> {
    if (this.decoded.has(url)) return Promise.resolve(null);
    let p = this.bytes.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(url, p);
    }
    return p;
  }

  /** Fetches and decodes the file; resolves to null if it cannot be had, so callers fall back. */
  load(url: string): Promise<Sample | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.decoded.get(url);
    if (!p) {
      p = this.prefetch(url).then(async (data) => {
        // Decoding detaches the bytes, and the decoded buffer is all that is needed from here on.
        this.bytes.delete(url);
        if (!data) return null;
        try {
          // The callback form works in every browser with Web Audio; newer ones also return a promise,
          // which is caught so a bad file is not reported twice.
          const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
            const pending = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
            pending?.catch(() => {});
          });
          const sample = { buffer, lead: leadingSilence(buffer) };
          this.ready.set(url, sample);
          return sample;
        } catch {
          return null;
        }
      });
      this.decoded.set(url, p);
      // A failed fetch or decode can be tried again later (a dropped connection, say).
      void p.then((s) => {
        if (!s) this.decoded.delete(url);
      });
    }
    return p;
  }

  /** Loads files a few at a time, in order, so the first ones are ready soonest. */
  async loadAll(urls: string[], concurrency = 3): Promise<void> {
    const queue = [...urls];
    const worker = async () => {
      for (let url = queue.shift(); url; url = queue.shift()) await this.load(url);
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }
}
