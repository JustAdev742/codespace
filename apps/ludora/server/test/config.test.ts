import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

/*
 * Production settings that guard secrets: the server refuses to start on a
 * value published in this repository, because the IP hashes and the secret
 * lantern's knock rhythm are only as private as these keys.
 */

const prod = (over: Record<string, string>) => ({ APP_ENV: 'production', PUBLIC_ORIGIN: 'https://play.example.org', ...over });

describe('secret settings', () => {
  it('refuses the published placeholders for IP_HASH_KEY in production', () => {
    expect(() => loadConfig(prod({}))).toThrow(/IP_HASH_KEY/);
    expect(() => loadConfig(prod({ IP_HASH_KEY: 'change-me-to-a-long-random-value' }))).toThrow(/IP_HASH_KEY/);
    expect(() => loadConfig(prod({ IP_HASH_KEY: 'dev-only-ip-hash-key-change-me' }))).toThrow(/IP_HASH_KEY/);
    expect(loadConfig(prod({ IP_HASH_KEY: 'k'.repeat(40) })).isProduction).toBe(true);
  });

  it('treats an empty CHAOS_SECRET as unset, and refuses a placeholder or a short one', () => {
    expect(loadConfig(prod({ IP_HASH_KEY: 'k'.repeat(40), CHAOS_SECRET: '' })).CHAOS_SECRET).toBeUndefined();
    expect(() => loadConfig(prod({ IP_HASH_KEY: 'k'.repeat(40), CHAOS_SECRET: 'change-me-please-0123' }))).toThrow(/CHAOS_SECRET/);
    expect(() => loadConfig(prod({ IP_HASH_KEY: 'k'.repeat(40), CHAOS_SECRET: 'short' }))).toThrow(/CHAOS_SECRET/);
    expect(loadConfig(prod({ IP_HASH_KEY: 'k'.repeat(40), CHAOS_SECRET: 's'.repeat(64) })).CHAOS_SECRET).toBe('s'.repeat(64));
  });

  it('lets development run on its defaults', () => {
    expect(loadConfig({ APP_ENV: 'development' }).isProduction).toBe(false);
  });

  it('always limits sign-ups and guests from one address: the limit can be raised, never switched off', () => {
    const base = loadConfig({});
    expect(base.SIGNUPS_PER_10_MIN).toBe(40);
    expect(base.GUESTS_PER_10_MIN).toBe(60);
    expect(loadConfig({ SIGNUPS_PER_10_MIN: '600', GUESTS_PER_10_MIN: '600' }).SIGNUPS_PER_10_MIN).toBe(600);
    expect(() => loadConfig({ SIGNUPS_PER_10_MIN: '0' })).toThrow(/SIGNUPS_PER_10_MIN/);
    expect(() => loadConfig({ GUESTS_PER_10_MIN: '1000000' })).toThrow(/GUESTS_PER_10_MIN/);
  });
});
