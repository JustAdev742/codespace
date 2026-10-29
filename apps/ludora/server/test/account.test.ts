import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { io as connect, type Socket } from 'socket.io-client';
import { MIXED_SET } from '@ludora/engine/testing';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { cliChangeRole } from '../src/cli/admin.ts';
import { purgeStale } from '../src/modules/users/retention.ts';
import { auditLog, gameParticipants, gameSessions, questionSets, sessions, uploads, users, wallets } from '../src/db/schema.ts';

/*
 * A player's own data: downloading everything stored about the account, and
 * deleting it. Deleting must leave nothing that names the account, keep what
 * other people rely on (public sets, finished games), and still let a game
 * the player was in save its results.
 */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAF0lEQVR4AWL6v0Hhv7XSsv8gmokBCQAAAAD//x3OmzEAAAAGSURBVAMAlBkHo5cp4fcAAAAASUVORK5CYII=', 'base64');

let t: TestContext;
let uploadDir: string;
let base: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'ludora-uploads-'));
  t = await createTestApp({ UPLOAD_DIR: uploadDir });
  attachRealtime(t.app, t.deps);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.close();
});

function upload(c: Client) {
  const boundary = `ludora${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return c.request('POST', '/api/uploads', body, { 'content-type': `multipart/form-data; boundary=${boundary}` });
}

const setWith = (title: string, visibility: 'private' | 'public', image?: string) => ({
  title,
  description: 'Account test',
  subject: 'general',
  visibility,
  questions: [
    { id: 'q1', type: 'truefalse', prompt: 'Glims glow.', correct: true, ...(image ? { media: { kind: 'image', url: image, alt: 'A Glim' } } : {}) },
    { id: 'q2', type: 'truefalse', prompt: 'Two', correct: true },
    { id: 'q3', type: 'truefalse', prompt: 'Three', correct: false },
  ],
});

const cookieOf = (c: Client) => `ludora_sid=${c.cookies.get('ludora_sid')}`;
function socketFor(cookie?: string): Socket {
  const s = connect(base, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true, reconnection: false });
  sockets.push(s);
  return s;
}
function emit<T = any>(s: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 5000);
    s.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

describe('the legal pages', () => {
  it('say who runs this copy only when the operator has set it', async () => {
    expect((await new Client(t.app).get('/api/legal')).body).toEqual({ operatorName: null, operatorContact: null });
  });
});

describe('downloading my data', () => {
  it('gives the account its own rows as a file, with no secrets', async () => {
    expect((await new Client(t.app).get('/api/me/export')).status).toBe(401);
    const me = await registered(t.app);
    const res = await me.client.get('/api/me/export');
    expect(res.status).toBe(200);
    expect(res.res.headers['content-disposition']).toBe(`attachment; filename="ludora-data-${me.username}.json"`);
    expect(res.res.headers['cache-control']).toContain('no-store');
    expect(res.body.account).toMatchObject({ id: me.userId, username: me.username });
    expect(res.body.tables.wallets.length).toBeGreaterThan(0);
    expect(res.body.tables.sessions.length).toBeGreaterThan(0);
    expect(res.body.tables.inventory.length).toBeGreaterThan(0);
    // Password and recovery hashes, session token hashes and lockout counters never leave the server.
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/hash|token|\$argon2/i);
    expect(res.body.account).not.toHaveProperty('failedLogins');
  });

  it('works for a guest, who has no username', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    const res = await guest.get('/api/me/export');
    expect(res.status).toBe(200);
    expect(res.res.headers['content-disposition']).toContain('ludora-data-guest.json');
  });
});

describe('deleting my account', () => {
  it('asks for the username and the password, and refuses staff', async () => {
    expect((await new Client(t.app).post('/api/me/delete', { confirm: 'x' })).status).toBe(401);
    const me = await registered(t.app);
    const wrongName = await me.client.post('/api/me/delete', { confirm: 'someone-else', password: me.password });
    expect(wrongName.status).toBe(400);
    expect(wrongName.body.error.fields).toHaveProperty('confirm');
    const wrongPassword = await me.client.post('/api/me/delete', { confirm: me.username, password: 'not my password' });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.error.fields).toHaveProperty('password');
    const noPassword = await me.client.post('/api/me/delete', { confirm: me.username });
    expect(noPassword.status).toBe(400);
    expect((await me.client.get('/api/auth/me')).body.user.id).toBe(me.userId);

    const staff = await registered(t.app);
    expect((await cliChangeRole(t.db, 'test', 'grant', staff.username, 'moderator', 'test setup')).ok).toBe(true);
    const refused = await staff.client.post('/api/me/delete', { confirm: staff.username, password: staff.password });
    expect(refused.status).toBe(409);
    expect(await t.db.select().from(users).where(eq(users.id, staff.userId))).toHaveLength(1);
  });

  it('removes the account, its private sets and images, and keeps public sets without a name', async () => {
    const me = await registered(t.app);
    // Trusted accounts may publish public sets.
    expect((await cliChangeRole(t.db, 'test', 'grant', me.username, 'trusted', 'test setup')).ok).toBe(true);
    const shared = (await upload(me.client)).body.url as string;
    const onlyMine = (await upload(me.client)).body.url as string;
    const publicSet = await me.client.post('/api/sets', setWith('For everyone', 'public', shared));
    expect(publicSet.status, JSON.stringify(publicSet.body)).toBe(200);
    const privateSet = await me.client.post('/api/sets', setWith('Just mine', 'private', onlyMine));
    expect(privateSet.status).toBe(200);
    const fileOf = (url: string) => join(uploadDir, url.slice('/uploads/'.length));
    expect(existsSync(fileOf(onlyMine))).toBe(true);

    const sid = me.client.cookies.get('ludora_sid')!;
    // Case does not matter, and surrounding spaces are forgiven.
    const res = await me.client.post('/api/me/delete', { confirm: ` ${me.username.toUpperCase()} `, password: me.password });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(me.client.cookies.has('ludora_sid')).toBe(false);

    // The old session no longer works, even if someone kept the cookie.
    const stale = new Client(t.app);
    stale.cookies.set('ludora_sid', sid);
    expect((await stale.get('/api/auth/me')).body.user).toBeNull();
    expect((await stale.get('/api/me/export')).status).toBe(401);
    expect(await t.db.select().from(users).where(eq(users.id, me.userId))).toHaveLength(0);
    expect(await t.db.select().from(wallets).where(eq(wallets.userId, me.userId))).toHaveLength(0);

    const [kept] = await t.db.select().from(questionSets).where(eq(questionSets.id, publicSet.body.set.id));
    expect(kept).toMatchObject({ title: 'For everyone', ownerId: null });
    expect(await t.db.select().from(questionSets).where(eq(questionSets.id, privateSet.body.set.id))).toHaveLength(0);

    // The image the public set shows stays; the one only the private set used is gone, file and all.
    expect((await t.app.inject({ method: 'GET', url: shared })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: onlyMine })).statusCode).toBe(404);
    expect(existsSync(fileOf(onlyMine))).toBe(false);
    const sharedId = shared.slice('/uploads/'.length, shared.lastIndexOf('.'));
    const [sharedRow] = await t.db.select().from(uploads).where(eq(uploads.id, sharedId));
    expect(sharedRow?.ownerId).toBeNull();

    // The record says that an account was deleted and how much went with it, and names no one.
    // Earlier entries about the account (here, the role grant) stay, without the name.
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.targetId, me.userId));
    expect(entries.map((e) => e.action).sort()).toEqual(['account.deleted', 'user.role_grant']);
    expect(entries.find((e) => e.action === 'account.deleted')).toMatchObject({ targetType: 'user', actorId: null, after: { privateSets: 1, images: 1 } });
    expect(JSON.stringify(entries)).not.toContain(me.username);

    // The username is free again.
    expect((await new Client(t.app).post('/api/auth/register', { username: me.username, password: 'another long password', accountType: 'player' })).status).toBe(200);
  });

  it('lets a guest delete with the word delete', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    const id = (await guest.get('/api/auth/me')).body.user.id as string;
    expect((await guest.post('/api/me/delete', { confirm: 'yes' })).status).toBe(400);
    expect((await guest.post('/api/me/delete', { confirm: 'Delete' })).status).toBe(200);
    expect(await t.db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
  });

  it('takes the player out of a live game, which still saves for everyone else', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const leaving = await registered(t.app);
    const staying = await registered(t.app);
    const [set] = await t.db
      .insert(questionSets)
      .values({ ownerId: host.userId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
      .returning({ id: questionSets.id });
    const { body } = await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', common: { questionLimit: 3, questionTimeSec: 10 } });
    const hostSock = socketFor(cookieOf(host.client));
    await emit(hostSock, 'room:join', { code: body.code });
    const leavingSock = socketFor(cookieOf(leaving.client));
    const closed = new Promise<any>((resolve) => leavingSock.on('room:closed', resolve));
    expect(await emit(leavingSock, 'room:join', { code: body.code })).toMatchObject({ ok: true });
    expect(await emit(socketFor(cookieOf(staying.client)), 'room:join', { code: body.code })).toMatchObject({ ok: true });
    expect(await emit(hostSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });

    expect((await leaving.client.post('/api/me/delete', { confirm: leaving.username, password: leaving.password })).status).toBe(200);
    expect(await closed).toMatchObject({ reason: 'removed', message: 'This player has left Ludora.' });

    expect(await emit(hostSock, 'room:host', { cmd: 'end' })).toMatchObject({ ok: true });
    await t.deps.rooms.idle();
    const [game] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, body.code));
    expect(game).toBeDefined();
    const parts = await t.db.select().from(gameParticipants).where(eq(gameParticipants.gameId, game!.id));
    expect(parts.some((p) => p.userId === staying.userId)).toBe(true);
    expect(parts.some((p) => p.userId === leaving.userId)).toBe(false);

    // Deleting later keeps the saved game's scores under "Player".
    expect((await staying.client.post('/api/me/delete', { confirm: staying.username, password: staying.password })).status).toBe(200);
    const after = await t.db.select().from(gameParticipants).where(eq(gameParticipants.gameId, game!.id));
    expect(after).toHaveLength(parts.length);
    expect(JSON.stringify(after)).not.toContain(staying.username);
    expect(JSON.stringify(after)).not.toContain(leaving.username);
  }, 30_000);
});

describe('keeping no more than needed', () => {
  it('removes old sign-ins and guests nobody can get back into, and nothing else', async () => {
    const guestId = async () => {
      const g = new Client(t.app);
      await g.post('/api/auth/guest', {});
      return { client: g, id: (await g.get('/api/auth/me')).body.user.id as string };
    };
    const lost = await guestId(); // old guest whose sign-in ran out long ago
    const recent = await guestId(); // a guest made today whose sign-in ran out: too new to remove
    const active = await guestId(); // old guest still signed in
    const member = await registered(t.app); // an account with a password, signed in long ago
    const ago = (days: number) => sql`now() - make_interval(days => ${days})`;
    await t.db.update(users).set({ createdAt: ago(60) }).where(sql`${users.id} in (${lost.id}, ${active.id}, ${member.userId})`);
    await t.db.update(sessions).set({ expiresAt: ago(10) }).where(sql`${sessions.userId} in (${lost.id}, ${recent.id}, ${member.userId})`);

    const result = await purgeStale(t.db);
    expect(result.sessions).toBeGreaterThanOrEqual(3);
    expect(result.guests).toBeGreaterThanOrEqual(1);
    const left = async (id: string) => (await t.db.select({ id: users.id }).from(users).where(eq(users.id, id))).length;
    expect(await left(lost.id)).toBe(0);
    expect(await left(recent.id)).toBe(1);
    expect(await left(active.id)).toBe(1);
    expect(await left(member.userId)).toBe(1);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, member.userId))).toHaveLength(0);
    expect((await active.client.get('/api/auth/me')).body.user.id).toBe(active.id);
    // Signing in again works as normal.
    expect((await new Client(t.app).post('/api/auth/login', { username: member.username, password: member.password })).status).toBe(200);
  });
});
