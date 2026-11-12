import { describe, expect, it } from 'vitest';
import { cleanPrefs, maxBots, readSoloPrefs, SOLO_PREFS_KEY, SOLO_PREFS_MAX, soloPrefsKey, soloSummary, writeSoloPrefs, type KeyValueStore } from './soloSettings.ts';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('remembered solo settings', () => {
  it('keys a game by its variant, else its mode, else the made game', () => {
    expect(soloPrefsKey({ modeId: 'comet-dash', variantId: null })).toBe('comet-dash');
    expect(soloPrefsKey({ modeId: 'comet-dash', variantId: 'comet-sprint' })).toBe('comet-sprint');
    expect(soloPrefsKey({ modeId: 'made-game', madeGameId: 'abc' })).toBe('made:abc');
  });

  it('gives back what was saved for that game only, and nothing the first time', () => {
    const store = memory();
    expect(readSoloPrefs('gold-rush', store)).toBeNull();
    writeSoloPrefs('gold-rush', { common: { questionLimit: 8, questionTimeSec: 30 }, settings: { startingGold: 50 }, bots: 3, botLevel: 'hard' }, store);
    expect(readSoloPrefs('gold-rush', store)).toEqual({ common: { questionLimit: 8, questionTimeSec: 30 }, settings: { startingGold: 50 }, bots: 3, botLevel: 'hard' });
    expect(readSoloPrefs('comet-dash', store)).toBeNull();
  });

  it('drops anything malformed rather than trusting it', () => {
    expect(cleanPrefs({ common: { questionLimit: '8', ok: 4 }, settings: { a: { nested: true }, b: 'x' }, bots: 99, botLevel: 'godlike' })).toEqual({ common: { ok: 4 }, settings: { b: 'x' }, bots: 5, botLevel: 'mixed' });
    expect(cleanPrefs('nope')).toBeNull();
    const store = memory();
    store.setItem(SOLO_PREFS_KEY, '{not json');
    expect(readSoloPrefs('x', store)).toBeNull();
    // Writing over broken storage starts afresh.
    writeSoloPrefs('x', { common: {}, settings: {}, bots: 1, botLevel: 'easy' }, store);
    expect(readSoloPrefs('x', store)?.bots).toBe(1);
  });

  it('forgets the oldest game past the limit, and keeps the one played again', () => {
    const store = memory();
    const p = { common: {}, settings: {}, bots: 0, botLevel: 'mixed' as const };
    for (let i = 0; i < SOLO_PREFS_MAX; i++) writeSoloPrefs(`m${i}`, p, store);
    writeSoloPrefs('m0', { ...p, bots: 2 }, store);
    writeSoloPrefs('new', p, store);
    expect(readSoloPrefs('m1', store)).toBeNull();
    expect(readSoloPrefs('m0', store)?.bots).toBe(2);
    expect(Object.keys(JSON.parse(store.data.get(SOLO_PREFS_KEY)!))).toHaveLength(SOLO_PREFS_MAX);
  });

  it('works with no storage at all', () => {
    expect(readSoloPrefs('x', null)).toBeNull();
    expect(() => writeSoloPrefs('x', { common: {}, settings: {}, bots: 0, botLevel: 'mixed' }, null)).not.toThrow();
  });
});

describe('the settings summary', () => {
  it('says what Start playing will start, in words', () => {
    expect(soloSummary({ questionLimit: 10, questionTimeSec: 20, bots: 3, botLevel: 'mixed' })).toBe('10 questions, 20 seconds each, 3 bots (Mixed class)');
    expect(soloSummary({ questionLimit: 0, timeLimitSec: 0, bots: 0, botLevel: 'mixed', onlyLevel: 'hard' })).toBe('every question, only the hard ones, no time limit, no bots');
    expect(soloSummary({ timeLimitSec: 90, bots: 1, botLevel: 'mine' })).toBe('1.5 min to play, 1 bot (My level)');
  });
  it('offers no more bots than the mode has room for', () => {
    expect(maxBots(200)).toBe(5);
    expect(maxBots(4)).toBe(3);
    expect(maxBots(1)).toBe(0);
  });
});
