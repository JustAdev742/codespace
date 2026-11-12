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

describe('the address people open', () => {
  const key = { APP_ENV: 'production', IP_HASH_KEY: 'a-long-random-value-for-this-test' };

  it('comes from Render when PUBLIC_ORIGIN is not set, and only that origin is allowed in production', () => {
    const c = loadConfig({ ...key, RENDER_EXTERNAL_URL: 'https://ludora-abcd.onrender.com' });
    expect(c.PUBLIC_ORIGIN).toBe('https://ludora-abcd.onrender.com');
    expect(c.allowedOrigins).toEqual(['https://ludora-abcd.onrender.com']);
    // An empty value (a field left blank in a dashboard) counts as not set.
    expect(loadConfig({ ...key, PUBLIC_ORIGIN: '', RENDER_EXTERNAL_URL: 'https://ludora-abcd.onrender.com' }).PUBLIC_ORIGIN).toBe('https://ludora-abcd.onrender.com');
  });

  it('is PUBLIC_ORIGIN when that is set, whatever Render says (a custom domain)', () => {
    const c = loadConfig({ ...key, PUBLIC_ORIGIN: 'https://play.example.org', RENDER_EXTERNAL_URL: 'https://ludora-abcd.onrender.com' });
    expect(c.allowedOrigins).toEqual(['https://play.example.org']);
  });

  it('is unchanged away from Render', () => {
    expect(loadConfig({ APP_ENV: 'development' }).PUBLIC_ORIGIN).toBe('http://localhost:5173');
    expect(() => loadConfig({ ...key, RENDER_EXTERNAL_URL: 'not a url' })).toThrow(/PUBLIC_ORIGIN/);
  });

  it('keeps uploads on disk unless told to keep them in the database, with an allowance per account and a cap per file', () => {
    const base = loadConfig({});
    expect(base.UPLOAD_STORE).toBe('disk');
    expect(base.UPLOAD_DB_ACCOUNT_BYTES).toBe(25_000_000);
    expect(base.UPLOAD_DB_FILE_BYTES).toBe(700_000);
    const db = loadConfig({ UPLOAD_STORE: 'db', UPLOAD_DB_ACCOUNT_BYTES: '5000000', UPLOAD_DB_FILE_BYTES: '300000' });
    expect([db.UPLOAD_STORE, db.UPLOAD_DB_ACCOUNT_BYTES, db.UPLOAD_DB_FILE_BYTES]).toEqual(['db', 5_000_000, 300_000]);
    expect(() => loadConfig({ UPLOAD_STORE: 's3' })).toThrow(/UPLOAD_STORE/);
    expect(() => loadConfig({ UPLOAD_DB_FILE_BYTES: '5000000' })).toThrow(/UPLOAD_DB_FILE_BYTES/);
  });
});

describe('AI providers', () => {
  it('has none unless AI_PROVIDERS is set, and keeps the default limits', () => {
    const c = loadConfig({ APP_ENV: 'development' });
    expect(c.AI_PROVIDERS).toEqual([]);
    expect(c.AI_TIMEOUT_SEC).toBe(60);
    expect(c.AI_PER_ADDRESS_10_MIN).toBe(60);
    expect(loadConfig({ APP_ENV: 'development', AI_PROVIDERS: '' }).AI_PROVIDERS).toEqual([]);
  });

  it('reads a JSON list of providers, with plain or labelled models', () => {
    const c = loadConfig({ APP_ENV: 'development', AI_PROVIDERS: JSON.stringify([{ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', models: ['m1', { id: 'm2', label: 'Model two' }] }]) });
    expect(c.AI_PROVIDERS).toEqual([{ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', models: ['m1', { id: 'm2', label: 'Model two' }], jsonMode: true }]);
  });

  it('refuses a broken AI_PROVIDERS without repeating it, since it holds keys', () => {
    const secret = 'sk-secret-value-0123456789';
    const broken = (value: string) => {
      try {
        loadConfig({ APP_ENV: 'development', AI_PROVIDERS: value });
        return '';
      } catch (err) {
        return (err as Error).message;
      }
    };
    expect(broken(`[{"name":"Groq","apiKey":"${secret}"`)).toMatch(/AI_PROVIDERS must be a JSON list/);
    const missing = broken(JSON.stringify([{ name: 'Groq', apiKey: secret, models: [] }]));
    expect(missing).toMatch(/AI_PROVIDERS: .*baseUrl/);
    expect(missing).not.toContain(secret);
    expect(broken(JSON.stringify([{ name: 'X', baseUrl: 'ftp://x.example', models: ['m'] }]))).toMatch(/AI_PROVIDERS/);
    expect(() => loadConfig({ APP_ENV: 'development', AI_TIMEOUT_SEC: '0' })).toThrow(/AI_TIMEOUT_SEC/);
  });
});
