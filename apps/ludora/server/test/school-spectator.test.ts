import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { questionSets } from '../src/db/schema.ts';

/*
 * The spectator screen: a signed-in account can show a running game on a second display. It gets
 * the view every player already sees on the projector (display names, no reconnect tokens, no
 * answers before the reveal) and can send nothing: no host commands, moves or reactions.
 */

let t: TestContext;
let base: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  t = await createTestApp();
  attachRealtime(t.app, t.deps);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.close();
});

const cookieOf = (c: { cookies: Map<string, string> }) => `ludora_sid=${c.cookies.get('ludora_sid')}`;
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

describe('spectator screen', () => {
  it('shows only what players see, to signed-in accounts, and accepts nothing from it', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const player = await registered(t.app);
    const viewer = await registered(t.app);
    const [set] = await t.db.select({ id: questionSets.id }).from(questionSets).where(eq(questionSets.isOfficial, true)).limit(1);
    const { code } = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic' })).body;

    const p = socketFor(cookieOf(player.client));
    const joined = await emit(p, 'room:join', { code, name: 'Player one' });
    expect(joined.ok).toBe(true);

    const anon = socketFor();
    expect((await emit(anon, 'room:watch', { code })).ok).toBe(false);

    const s = socketFor(cookieOf(viewer.client));
    const views: any[] = [];
    s.on('room:view', (v) => views.push(v));
    const watched = await emit(s, 'room:watch', { code });
    expect(watched).toMatchObject({ ok: true, role: 'spectator' });
    await new Promise((r) => setTimeout(r, 200));
    const v = views.at(-1);
    expect(v.room.code).toBe(code);
    expect(v.players.map((x: { name: string }) => x.name)).toEqual(['Player one']);
    const text = JSON.stringify(v);
    expect(text).not.toContain(joined.reconnectToken);
    expect(text).not.toContain(player.username);
    // Nothing only the host sees: still answering, the waiting room, the class summary.
    expect(v.host).toBeUndefined();

    expect((await emit(s, 'room:host', { cmd: 'start' })).ok).toBe(false);
    expect((await emit(s, 'room:action', { actionId: 'abcdefgh1', action: {} })).ok).toBe(false);
    expect((await emit(s, 'room:react', { emote: 'wave' })).ok).toBe(false);
    expect(t.deps.rooms.get(code)!.status).toBe('lobby');
    expect((await emit(s, 'room:watch', { code: '000000' })).ok).toBe(false);
  });

  it('is not a way round a locked room, a waiting room or a class-only game', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const student = await registered(t.app, { accountType: 'student' });
    const outsider = await registered(t.app);
    const [set] = await t.db.select({ id: questionSets.id }).from(questionSets).where(eq(questionSets.isOfficial, true)).limit(1);
    const watch = async (who: { client: { cookies: Map<string, string> } }, code: string) => (await emit(socketFor(cookieOf(who.client)), 'room:watch', { code })).ok;

    // Locked: the outsider is refused, the host's own second screen still works.
    const locked = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic' })).body.code;
    expect(await watch(outsider, locked)).toBe(true);
    const h = socketFor(cookieOf(host.client));
    expect((await emit(h, 'room:join', { code: locked })).ok).toBe(true);
    expect((await emit(h, 'room:host', { cmd: 'lock', locked: true })).ok).toBe(true);
    expect(await watch(outsider, locked)).toBe(false);
    expect(await watch(host, locked)).toBe(true);

    // A waiting room: the host decides who comes in, so nobody watches from outside.
    const waiting = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', options: { admit: true } })).body.code;
    expect(t.deps.rooms.get(waiting)!.options.admit).toBe(true);
    expect(await watch(outsider, waiting)).toBe(false);
    expect(await watch(host, waiting)).toBe(true);

    // A class game: members and the host, not other accounts.
    const made = await host.client.post('/api/classes', { name: 'Year 6 Ash' });
    await student.client.post('/api/classes/join', { code: made.body.class.joinCode });
    const forClass = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', classId: made.body.class.id })).body.code;
    expect(await watch(outsider, forClass)).toBe(false);
    expect(await watch(student, forClass)).toBe(true);
    expect(await watch(host, forClass)).toBe(true);
  });
});

