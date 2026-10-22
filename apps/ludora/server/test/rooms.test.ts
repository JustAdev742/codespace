import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { MIXED_SET } from '@ludora/engine/testing';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { MAX_ROOMS_PER_HOST } from '../src/realtime/manager.ts';
import { gameSessions, questionSets } from '../src/db/schema.ts';

/*
 * A host's open games outside the room: listing them, closing one for everyone,
 * the limit on how many can be open, and modes that cannot be played alone.
 */

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
function socketFor(cookie?: string): Socket {
  const s = connect(base, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true, reconnection: false });
  sockets.push(s);
  return s;
}
afterAll(() => sockets.forEach((s) => s.close()));

function emit<T = any>(s: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 5000);
    s.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/** Resolves once `event` brings a payload matching `pred`, counting the latest one already received. */
function watch(s: Socket, event: string) {
  let latest: any = null;
  const waiters: { pred: (v: any) => boolean; resolve: (v: any) => void }[] = [];
  s.on(event, (v) => {
    latest = v;
    for (const w of waiters.filter((x) => x.pred(v))) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(v);
    }
  });
  return (pred: (v: any) => boolean = () => true, ms = 8000): Promise<any> => {
    if (latest && pred(latest)) return Promise.resolve(latest);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} never matched; last: ${JSON.stringify(latest?.room?.status ?? latest)}`)), ms);
      waiters.push({ pred, resolve: (v) => (clearTimeout(timer), resolve(v)) });
    });
  };
}

async function createSet(ownerId: string) {
  const [row] = await t.db
    .insert(questionSets)
    .values({ ownerId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
    .returning({ id: questionSets.id });
  return row!.id;
}

const cookieOf = (c: Client) => `ludora_sid=${c.cookies.get('ludora_sid')}`;
const codes = (body: { rooms: { code: string }[] }) => body.rooms.map((r) => r.code);

describe('open games', () => {
  it('lists only the host’s own open games, and closing a lobby sends everyone out', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const other = await registered(t.app);
    const setId = await createSet(host.userId);
    const first = (await host.client.post('/api/rooms', { setId, modeId: 'classic' })).body.code as string;
    const second = (await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' })).body.code as string;
    await host.client.post('/api/rooms', { setId, modeId: 'comet-dash', solo: true });
    await other.client.post('/api/rooms', { setId: await createSet(other.userId), modeId: 'classic' });

    const listed = await host.client.get('/api/rooms');
    expect(listed.status).toBe(200);
    expect(listed.body.limit).toBe(MAX_ROOMS_PER_HOST);
    // Newest first; solo games and other hosts' rooms are not listed.
    expect(codes(listed.body)).toEqual([second, first]);
    expect(listed.body.rooms[0]).toMatchObject({ status: 'lobby', title: 'Comet Dash', setTitle: 'Mixed bag', players: 0 });
    expect(listed.body.rooms[0]).not.toHaveProperty('hostUserId');

    const player = socketFor();
    const closed = watch(player, 'room:closed');
    expect(await emit(player, 'room:join', { code: first, name: 'Quiet Fern' })).toMatchObject({ ok: true });

    // Another account cannot close it, and cannot tell it exists.
    const refused = await other.client.post(`/api/rooms/${first}/close`);
    expect(refused.status).toBe(404);
    expect(refused.body.error.message).toBe((await other.client.post('/api/rooms/999999/close')).body.error.message);
    expect((await new Client(t.app).post(`/api/rooms/${first}/close`)).status).toBe(401);

    const done = await host.client.post(`/api/rooms/${first}/close`);
    expect(done.body).toEqual({ ok: true, outcome: 'closed' });
    expect(await closed()).toEqual({ reason: 'closed', message: 'The host closed this room.' });
    expect(codes((await host.client.get('/api/rooms')).body)).toEqual([second]);
    expect((await host.client.get(`/api/rooms/${first}`)).status).toBe(404);
    expect((await host.client.post(`/api/rooms/${first}/close`)).status).toBe(404);
  });

  it('closing a game the host walked away from ends it normally: players get their results and it is saved', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const setId = await createSet(host.userId);
    const code = (await host.client.post('/api/rooms', { setId, modeId: 'classic' })).body.code as string;

    const hostSock = socketFor(cookieOf(host.client));
    expect(await emit(hostSock, 'room:join', { code })).toMatchObject({ ok: true, role: 'host' });
    const player = socketFor();
    const views = watch(player, 'room:view');
    expect(await emit(player, 'room:join', { code, name: 'Lucky Heron' })).toMatchObject({ ok: true });
    expect(await emit(hostSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });
    // The host leaves mid-game: a host-paced game pauses and waits for them.
    hostSock.close();
    await views((v) => v.room.status === 'paused');
    expect((await host.client.get('/api/rooms')).body.rooms[0]).toMatchObject({ code, status: 'paused', players: 1 });

    const done = await host.client.post(`/api/rooms/${code}/close`);
    expect(done.body).toEqual({ ok: true, outcome: 'ended' });
    const ended = await views((v) => v.room.status === 'ended' && v.results);
    expect(ended.results.standings.map((s: { name: string }) => s.name)).toEqual(['Lucky Heron']);
    // A finished game is not open any more, and nobody new can join it.
    expect((await host.client.get('/api/rooms')).body.rooms).toEqual([]);
    expect(await emit(socketFor(), 'room:join', { code, name: 'Late Comer' })).toMatchObject({ ok: false, error: { code: 'room_closed' } });
    await t.deps.rooms.idle();
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, code))).toHaveLength(1);
  });
});

describe('the open games limit', () => {
  it('counts open games only: finished games and solo games never stop a host making a new one', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const setId = await createSet(host.userId);
    const made: string[] = [];
    for (let i = 0; i < MAX_ROOMS_PER_HOST; i++) {
      const r = await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' });
      expect(r.status).toBe(200);
      made.push(r.body.code);
    }
    const full = await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/Close one in Your open games/);
    expect((await host.client.post('/api/rooms', { setId, modeId: 'comet-dash', solo: true })).status).toBe(200);

    // Play the two oldest games to the end: they are finished, not open.
    for (const code of made.slice(0, 2)) {
      const room = t.deps.rooms.get(code)!;
      expect(room.hostCommand({ cmd: 'addBots', count: 1 })).toMatchObject({ ok: true });
      expect(room.hostCommand({ cmd: 'start' })).toMatchObject({ ok: true });
      expect(room.hostCommand({ cmd: 'end' })).toMatchObject({ ok: true });
      expect(room.status).toBe('ended');
    }
    await t.deps.rooms.idle();
    expect((await host.client.get('/api/rooms')).body.rooms).toHaveLength(MAX_ROOMS_PER_HOST - 2);

    const next = await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' });
    expect(next.status).toBe(200);
    // The room count stays within the limit: the oldest finished room made way, the other is still showing its results.
    expect(t.deps.rooms.get(made[0]!)).toBeUndefined();
    expect(t.deps.rooms.get(made[1]!)?.status).toBe('ended');
    expect(t.deps.rooms.hostedBy(host.userId).filter((r) => !r.solo)).toHaveLength(MAX_ROOMS_PER_HOST);

    // Closing an open game from the list makes room too.
    expect((await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' })).status).toBe(200);
    expect((await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' })).status).toBe(409);
    expect((await host.client.post(`/api/rooms/${made[2]}/close`)).body.outcome).toBe('closed');
    expect((await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' })).status).toBe(200);
  });
});

describe('team games are not played alone', () => {
  it('refuses team modes and variants for solo rooms and class assignments', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const setId = await createSet(teacher.userId);
    const cls = (await teacher.client.post('/api/classes', { name: 'Team test' })).body.class.id as string;
    for (const [modeId, variantId] of [
      ['classic', 'classic-teams'],
      ['classic', 'classic-in-unison'],
      ['quick-draw', 'quick-draw-one-voice'],
      ['lantern-out', 'lantern-out-last-team'],
      ['tug-of-war', null],
    ] as const) {
      const assigned = await teacher.client.post(`/api/classes/${cls}/assignments`, { setId, modeId, variantId, title: 'Teams' });
      expect(assigned.status, `${variantId ?? modeId} assignment`).toBe(409);
      expect(assigned.body.error.message).toMatch(/several players at once.*Assignments are played alone/);
      expect((await teacher.client.post('/api/rooms', { setId, modeId, variantId, solo: true })).status, `${variantId ?? modeId} solo`).toBe(409);
    }
    expect((await teacher.client.post(`/api/classes/${cls}/assignments`, { setId, modeId: 'quick-draw', variantId: 'quick-draw-steady', title: 'Steady' })).status).toBe(200);
    // Hosting a team game for a room of players is still fine.
    expect((await teacher.client.post('/api/rooms', { setId, modeId: 'classic', variantId: 'classic-teams' })).status).toBe(200);
  });
});
