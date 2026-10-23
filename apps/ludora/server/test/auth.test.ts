import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, registered, uniqueName, type TestContext } from './helpers.ts';

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('registration and sessions', () => {
  it('registers, signs in through the cookie and reports permissions', async () => {
    const c = new Client(t.app);
    const username = uniqueName('reg');
    const r = await c.post('/api/auth/register', { username, password: 'a very good password', accountType: 'student' });
    expect(r.status).toBe(200);
    expect(r.body.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const me = await c.get('/api/auth/me');
    expect(me.body.user.username).toBe(username);
    expect(me.body.user.isGuest).toBe(false);
    expect(me.body.permissions).toContain('rooms.host');
    expect(me.body.permissions).not.toContain('staff.access');
    expect(me.res.headers['cache-control']).toBe('no-store');
  });

  it('sets a hardened session cookie', async () => {
    const c = new Client(t.app);
    const r = await c.post('/api/auth/register', { username: uniqueName('ck'), password: 'a very good password' });
    const cookie = (r.res.cookies as any[]).find((x) => x.name === 'ludora_sid');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.value.length).toBeGreaterThan(30);
  });

  it('rejects taken usernames, weak passwords and rude names', async () => {
    const { username } = await registered(t.app);
    const c = new Client(t.app);
    expect((await c.post('/api/auth/register', { username, password: 'a very good password' })).status).toBe(409);
    const weak = await c.post('/api/auth/register', { username: uniqueName('w'), password: 'password' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.password).toBeTruthy();
    expect((await c.post('/api/auth/register', { username: 'shithead12', password: 'a very good password' })).status).toBe(400);
  });

  it('logs in and out, and a revoked session no longer works', async () => {
    const { username, password } = await registered(t.app);
    const c = new Client(t.app);
    expect((await c.post('/api/auth/login', { username, password })).status).toBe(200);
    const token = c.cookies.get('ludora_sid')!;
    expect((await c.get('/api/auth/me')).body.user.username).toBe(username);
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
    const replay = new Client(t.app);
    replay.cookies.set('ludora_sid', token);
    expect((await replay.get('/api/auth/me')).body.user).toBeNull();
  });

  it('gives the same answer for unknown users and wrong passwords', async () => {
    const { username } = await registered(t.app);
    const c = new Client(t.app);
    const wrong = await c.post('/api/auth/login', { username, password: 'nope nope nope' });
    const unknown = await c.post('/api/auth/login', { username: 'nobody_here_x', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks an account after repeated wrong passwords', async () => {
    const { username, password } = await registered(t.app);
    const c = new Client(t.app);
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { username, password: 'wrong password!' });
    const locked = await c.post('/api/auth/login', { username, password });
    expect(locked.status).toBe(429);
    expect(locked.body.error.message).toMatch(/Try again in/);
  });

  it('recovers an account with the recovery code and signs out old sessions', async () => {
    const { client, username, recoveryCode } = await registered(t.app);
    const c = new Client(t.app);
    const r = await c.post('/api/auth/recover', { username, recoveryCode: recoveryCode.toLowerCase(), newPassword: 'brand new password' });
    expect(r.status).toBe(200);
    expect(r.body.recoveryCode).not.toBe(recoveryCode);
    expect((await client.get('/api/auth/me')).body.user).toBeNull();
    expect((await new Client(t.app).post('/api/auth/login', { username, password: 'brand new password' })).status).toBe(200);
    expect((await new Client(t.app).post('/api/auth/recover', { username, recoveryCode, newPassword: 'another password' })).status).toBe(401);
  });
});

describe('guests', () => {
  it('creates a guest with welcome Sparks and starter Glims, then claims it', async () => {
    const c = new Client(t.app);
    expect((await c.post('/api/auth/guest', { displayName: 'Swift Otter' })).status).toBe(200);
    const me = await c.get('/api/auth/me');
    expect(me.body.user.isGuest).toBe(true);
    expect(me.body.user.displayName).toBe('Swift Otter');
    const username = uniqueName('claim');
    const claim = await c.post('/api/auth/claim', { username, password: 'claimed password' });
    expect(claim.status).toBe(200);
    expect((await c.get('/api/auth/me')).body.user.username).toBe(username);
    expect((await c.post('/api/auth/claim', { username: uniqueName('x'), password: 'claimed password' })).status).toBe(409);
  });
});

describe('request protection', () => {
  it('blocks state-changing requests without the CSRF header', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    expect(res.statusCode).toBe(403);
    // The same error shape as every other API error, so the app can show the message.
    expect(res.json()).toEqual({ error: { code: 'forbidden', message: 'Request blocked. Reload the page and try again.' } });
  });
  it('blocks requests from a foreign origin', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {}, headers: { 'x-ludora-csrf': '1', origin: 'https://evil.example' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });
  it('accepts requests from a page at the address they were sent to, as in a Codespace', async () => {
    const host = 'fuzzy-train-8787.app.github.dev';
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {}, headers: { 'x-ludora-csrf': '1', origin: `https://${host}`, host } });
    expect(res.statusCode).toBeLessThan(300);
  });
  it('sends security headers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('answers unknown API routes with JSON 404', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('the API rate limit', () => {
  it('counts signed-in requests per account, so people sharing an IP do not share a budget', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    let status = 200;
    for (let i = 0; i < 700 && status !== 429; i++) status = (await a.client.get('/api/me/overview')).status;
    expect(status).toBe(429);
    expect((await b.client.get('/api/me/overview')).status).toBe(200);
  });
});

describe('serving the built web app', () => {
  it('serves the app for page routes, JSON for unknown API routes, and the usual error shape from hooks', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dist = mkdtempSync(join(tmpdir(), 'ludora-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Ludora</title>');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)');
    const web = await createTestApp({ WEB_DIST: dist });
    try {
      // Static files are never rate limited: a class behind one school IP loads dozens each.
      for (let i = 0; i < 650; i++) expect((await web.app.inject({ method: 'GET', url: '/app.js' })).statusCode).toBe(200);
      const page = await web.app.inject({ method: 'GET', url: '/shop' });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('<title>Ludora</title>');
      const api = await web.app.inject({ method: 'GET', url: '/api/nope' });
      expect(api.json()).toEqual({ error: { code: 'not_found', message: 'No such endpoint.' } });
      const blocked = await web.app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
      expect(blocked.json()).toEqual({ error: { code: 'forbidden', message: 'Request blocked. Reload the page and try again.' } });
    } finally {
      await web.close();
    }
  });
});
