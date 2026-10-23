import { describe, expect, it } from 'vitest';
import { originAllowed } from '../src/http/origins.ts';

const allowed = ['https://ludora.example'];

describe('originAllowed', () => {
  it('accepts the configured origins', () => {
    expect(originAllowed('https://ludora.example', { host: 'internal:8787' }, allowed, false)).toBe(true);
  });

  it('accepts a page at the address the request was sent to', () => {
    // A Codespace's forwarded address, and the localhost port VS Code desktop forwards it to.
    expect(originAllowed('https://fuzzy-train-8787.app.github.dev', { host: 'fuzzy-train-8787.app.github.dev' }, allowed, false)).toBe(true);
    expect(originAllowed('http://localhost:8788', { host: 'localhost:8788' }, allowed, false)).toBe(true);
    expect(originAllowed('http://192.168.1.20:8787', { host: '192.168.1.20:8787' }, allowed, false)).toBe(true);
  });

  it('refuses a page on another site, whatever address it sends its requests to', () => {
    expect(originAllowed('https://evil.example', { host: 'ludora.example' }, allowed, false)).toBe(false);
    expect(originAllowed('https://evil.example', { host: 'fuzzy-train-8787.app.github.dev' }, allowed, false)).toBe(false);
    // The same host on another port is another site.
    expect(originAllowed('http://localhost:9999', { host: 'localhost:8787' }, allowed, false)).toBe(false);
    expect(originAllowed('null', { host: 'localhost:8787' }, allowed, false)).toBe(false);
    expect(originAllowed('https://evil.example', {}, allowed, false)).toBe(false);
  });

  it('believes a forwarded host only from a trusted proxy', () => {
    const headers = { host: 'localhost:8787', 'x-forwarded-host': 'fuzzy-train-8787.app.github.dev' };
    expect(originAllowed('https://fuzzy-train-8787.app.github.dev', headers, allowed, true)).toBe(true);
    expect(originAllowed('https://fuzzy-train-8787.app.github.dev', headers, allowed, false)).toBe(false);
    // Only the first host a chain of proxies reports.
    expect(originAllowed('https://b.example', { host: 'x', 'x-forwarded-host': 'a.example, b.example' }, allowed, true)).toBe(false);
  });
});
