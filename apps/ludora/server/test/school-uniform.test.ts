import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { MIXED_SET } from '@ludora/engine/testing';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { questionSets } from '../src/db/schema.ts';
import { mergePreferences, preferencesPatchSchema, readPreferences } from '../src/modules/users/preferences.ts';

/*
 * Year-group uniforms on a school's copy: a player's year, blazer and kit are kept in their own
 * settings, and only the uniform they decide travels with their avatar. Guests choose on the join
 * screen; an account's settings win over anything sent at join.
 */

describe('school year in preferences', () => {
  it('starts unset, and one change keeps the rest of the choice', () => {
    expect(readPreferences({}).school).toEqual({ year: null, blazer: 'green', kit: 'school' });
    const year = mergePreferences(readPreferences({}), preferencesPatchSchema.parse({ school: { year: 8 } }));
    const grey = mergePreferences(year, preferencesPatchSchema.parse({ school: { blazer: 'grey' } }));
    expect(grey.school).toEqual({ year: 8, blazer: 'grey', kit: 'school' });
    expect(grey.theme).toBe('system');
  });

  it('refuses years and blazers that do not exist', () => {
    for (const school of [{ year: 13 }, { year: -1 }, { year: 4.5 }, { blazer: 'blue' }, { kit: 'mufti' }]) {
      expect(preferencesPatchSchema.safeParse({ school }).success, JSON.stringify(school)).toBe(false);
    }
  });
});

let t: TestContext;
let base: string;
beforeAll(async () => {
  t = await createTestApp();
  attachRealtime(t.app, t.deps);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await t?.close();
});

const sockets: Socket[] = [];
afterAll(() => sockets.forEach((s) => s.close()));
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
const cookieOf = (c: Client) => `ludora_sid=${c.cookies.get('ludora_sid')}`;

describe('uniforms in a room', () => {
  it('dresses each player for their year, and sends the uniform but never the year', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const [set] = await t.db
      .insert(questionSets)
      .values({ ownerId: host.userId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
      .returning({ id: questionSets.id });
    const code = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic' })).body.code as string;

    // An account in Year 9 with the grey blazer; a different year sent at join does not override it.
    const senior = await registered(t.app);
    expect((await senior.client.patch('/api/me/preferences', { school: { year: 9, blazer: 'grey' } })).status).toBe(200);
    expect((await senior.client.get('/api/auth/me')).body.user.preferences.school).toEqual({ year: 9, blazer: 'grey', kit: 'school' });
    expect((await senior.client.patch('/api/me/preferences', { school: { year: 13 } })).status).toBe(400);
    const seniorSocket = socketFor(cookieOf(senior.client));
    expect(await emit(seniorSocket, 'room:join', { code, dress: { year: 1, blazer: 'green', kit: 'school' } })).toMatchObject({ ok: true });

    // A guest in Year 2, and a guest who did not say.
    expect(await emit(socketFor(), 'room:join', { code, name: 'Little Wren', dress: { year: 2, blazer: 'grey', kit: 'school' } })).toMatchObject({ ok: true });
    expect(await emit(socketFor(), 'room:join', { code, name: 'Quiet Fern' })).toMatchObject({ ok: true });
    // A year that does not exist is refused like any bad join.
    expect(await emit(socketFor(), 'room:join', { code, name: 'Odd Owl', dress: { year: 14, blazer: 'grey', kit: 'school' } })).toMatchObject({ ok: false });

    const view = await new Promise<any>((resolve) => {
      const watcher = socketFor(cookieOf(host.client));
      watcher.on('room:view', (v) => {
        if (v.players?.length === 3) resolve(v);
      });
      void emit(watcher, 'room:join', { code });
    });
    const byName = Object.fromEntries(view.players.map((p: any) => [p.name, p.avatar]));
    expect(byName['Little Wren'].uniform).toBe('kinder');
    expect(byName['Quiet Fern'].uniform).toBeUndefined();
    const seniorAvatar = view.players.find((p: any) => p.name !== 'Little Wren' && p.name !== 'Quiet Fern').avatar;
    expect(seniorAvatar.uniform).toBe('senior-grey');
    // The year itself is nowhere in what other people receive.
    expect(JSON.stringify(view)).not.toMatch(/"year"|"blazer"|"kit"/);

    // The player's own overview carries the same uniform for their avatar.
    const overview = await senior.client.get('/api/me/overview');
    if (overview.body.avatar) expect(overview.body.avatar.uniform).toBe('senior-grey');
  });
});
