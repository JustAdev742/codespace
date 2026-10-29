import { describe, expect, it, vi } from 'vitest';
import { RARITIES } from '@ludora/shared';
import { MUSIC_ASSETS, SFX_ASSETS, type SfxAssetName } from './assets.generated.ts';
import { barSeconds, nextBarLine } from './loops.ts';
import { CORE_SFX, SampleBank, leadingSilence, nextTake, pitchRate, sampleFor, takesOf } from './samples.ts';
import { EFFECTS, type SfxName } from './sfx.ts';

const names = Object.keys(EFFECTS) as SfxName[];

describe('the recorded effects', () => {
  it('have a file for every effect, and every file belongs to an effect', () => {
    const used = new Set<SfxAssetName>();
    for (const name of names) {
      const variants = name === 'lanternReveal' ? RARITIES.map((rarity) => ({ rarity })) : Array.from({ length: 12 }, (_, n) => ({ n }));
      for (const o of variants) {
        const key = sampleFor(name, o);
        expect(key, `${name} ${JSON.stringify(o)}`).not.toBeNull();
        used.add(key!);
      }
    }
    expect([...used].sort()).toEqual(Object.keys(SFX_ASSETS).sort());
  });

  it('step through a family by n, wrapping round, negative numbers included', () => {
    expect(sampleFor('join', { n: 0 })).toBe('join-0');
    expect(sampleFor('join', { n: 9 })).toBe('join-1');
    expect(sampleFor('reaction', { n: -1 })).toBe('reaction-3');
    expect(sampleFor('step', {})).toBe('step-0');
    expect(sampleFor('lanternReveal', {})).toBe('lanternReveal-common');
    expect(sampleFor('lanternReveal', { rarity: 'mythic' })).toBe('lanternReveal-mythic');
  });

  it('fetch the core set from real files', () => {
    for (const key of CORE_SFX) expect(SFX_ASSETS[key].url).toMatch(/\.mp3$/);
  });

  it('list real files for every variation, and vary pitch by a small amount at most', () => {
    for (const [key, asset] of Object.entries(SFX_ASSETS)) {
      const a = asset as { url: string; alts?: readonly string[]; vary?: number; play: string };
      for (const url of takesOf(a as never)) expect(url, key).toMatch(/\.mp3$/);
      if (a.vary !== undefined) {
        expect(a.vary, key).toBeGreaterThan(0);
        expect(a.vary, `${key}: more than a third of a semitone stops sounding like the same sound`).toBeLessThanOrEqual(35);
        expect(a.play, `${key}: a build-up must keep its timing`).toBe('once');
      }
    }
  });

  it('say when a build-up lands', () => {
    for (const asset of Object.values(SFX_ASSETS)) {
      if (asset.play !== 'rise') continue;
      expect('land' in asset && asset.land).toBeGreaterThan(0);
      expect('land' in asset && asset.land).toBeLessThanOrEqual(asset.seconds);
    }
  });
});

describe('the music loops', () => {
  it.each(Object.entries(MUSIC_ASSETS))('%s loops a whole number of bars, with music either side of the loop', (_, a) => {
    const bars = (a.loopEnd - a.loopStart) / barSeconds(a);
    expect(Math.abs(bars - a.bars)).toBeLessThan(0.001);
    expect(a.loopStart).toBeGreaterThanOrEqual(0.25);
    expect(a.loopEnd - a.loopStart).toBeGreaterThanOrEqual(20);
  });

  it('finds the next bar line', () => {
    expect(nextBarLine(10, 2, 9)).toBe(10);
    expect(nextBarLine(10, 2, 10)).toBe(10);
    expect(nextBarLine(10, 2, 10.5)).toBe(12);
    expect(nextBarLine(10, 2, 12)).toBe(12);
    expect(nextBarLine(10, 2, 15.9)).toBe(16);
  });
});

/** A stand-in for AudioBuffer, enough for leadingSilence. */
function fakeBuffer(channels: number[][], sampleRate = 1000) {
  return { numberOfChannels: channels.length, length: channels[0]!.length, sampleRate, getChannelData: (c: number) => Float32Array.from(channels[c]!) } as unknown as AudioBuffer;
}

describe('leadingSilence', () => {
  it('finds where the sound starts, in the earliest channel, a millisecond early', () => {
    const quiet = Array.from({ length: 100 }, () => 0);
    const left = [...quiet.slice(0, 40), 0.5, ...quiet.slice(41)];
    const right = [...quiet.slice(0, 30), -0.2, ...quiet.slice(31)];
    expect(leadingSilence(fakeBuffer([left, right]))).toBeCloseTo(0.029, 6);
  });

  it('is zero for a sound that starts at once, and for silence', () => {
    expect(leadingSilence(fakeBuffer([[0.3, 0, 0]]))).toBe(0);
    expect(leadingSilence(fakeBuffer([Array.from({ length: 200 }, () => 0)]))).toBe(0);
  });
});

describe('SampleBank', () => {
  function setup(fail: string[] = []) {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      return fail.includes(url) ? { ok: false } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    const ctx = {
      decodeAudioData: (_data: ArrayBuffer, ok: (b: AudioBuffer) => void) => {
        ok(fakeBuffer([[0, 0, 0.5]]));
        return undefined;
      },
    } as unknown as BaseAudioContext;
    const bank = new SampleBank();
    return { bank, ctx, fetched };
  }

  it('decodes nothing before it has an audio context, but can fetch ahead', async () => {
    const { bank, ctx, fetched } = setup();
    expect(await bank.load('a.mp3')).toBeNull();
    await bank.prefetch('a.mp3');
    expect(fetched).toEqual(['a.mp3']);
    bank.attach(ctx);
    const sample = await bank.load('a.mp3');
    expect(sample?.lead).toBeCloseTo(0.001, 6);
    // The bytes fetched ahead were used, not fetched again.
    expect(fetched).toEqual(['a.mp3']);
    expect(bank.get('a.mp3')).toBe(sample);
    vi.unstubAllGlobals();
  });

  it('loads each file once, and tries a failed one again later', async () => {
    const { bank, ctx, fetched } = setup(['bad.mp3']);
    bank.attach(ctx);
    await bank.loadAll(['a.mp3', 'b.mp3', 'a.mp3', 'bad.mp3'], 2);
    expect(fetched.filter((u) => u === 'a.mp3')).toHaveLength(1);
    expect(bank.get('bad.mp3')).toBeNull();
    await bank.load('bad.mp3');
    expect(fetched.filter((u) => u === 'bad.mp3')).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

describe('variations', () => {
  it('never pick the take heard last when another is loaded', () => {
    for (let r = 0; r < 1; r += 0.05) {
      expect(nextTake([0, 1, 2], 1, r)).not.toBe(1);
      expect(nextTake([0, 2], 0, r)).toBe(2);
    }
  });

  it('use the only loaded take, even if it was the last one', () => {
    expect(nextTake([0], 0, 0.7)).toBe(0);
    expect(nextTake([2], undefined, 0.99)).toBe(2);
  });

  it('reach every other take', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) seen.add(nextTake([0, 1, 2, 3], 0, r));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('shift pitch within the range either way, and not at all with no range', () => {
    expect(pitchRate(0, 0.9)).toBe(1);
    expect(pitchRate(20, 0.5)).toBeCloseTo(1, 10);
    expect(pitchRate(20, 0)).toBeCloseTo(2 ** (-20 / 1200), 10);
    expect(pitchRate(20, 0.999999)).toBeLessThanOrEqual(2 ** (20 / 1200));
  });
});
