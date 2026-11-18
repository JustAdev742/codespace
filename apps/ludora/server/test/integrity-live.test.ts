import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { MIXED_SET } from '@ludora/engine/testing';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { auditLog, questionSets, userRoles } from '../src/db/schema.ts';
import { ILLEGAL_MOVES_COUNT } from '../src/realtime/integrity.ts';

/*
 * Integrity signals end to end: real sockets, the server's logger and the database. What staff
 * get (one warn line in the log, one entry in the audit log) and what players get (nothing new).
 */

let t: TestContext;
let base: string;
const warned: unknown[][] = [];

beforeAll(async () => {
  t = await createTestApp();
  // The test app's logger is silent; this is the call the server makes on it.
  vi.spyOn(t.deps.log!, 'warn').mockImplementation((...args: unknown[]) => void warned.push(args));
  attachRealtime(t.app, t.deps);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;
});
const sockets: Socket[] = [];
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.close();
});

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

const cookieOf = (c: { cookies: Map<string, string> }) => `ludora_sid=${c.cookies.get('ludora_sid')}`;
const lines = () => warned.filter(([obj]) => (obj as { ludora_event?: string })?.ludora_event === 'integrity');

describe('integrity signals over sockets', () => {
  it('writes one log line and one audit entry for each signal, and tells players nothing', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const [set] = await t.db
      .insert(questionSets)
      .values({ ownerId: host.userId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
      .returning({ id: questionSets.id });
    const created = await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', common: { questionLimit: 3, questionTimeSec: 10 } });
    expect(created.status).toBe(200);
    const code = created.body.code as string;

    const hostSock = socketFor(cookieOf(host.client));
    expect(await emit(hostSock, 'room:join', { code })).toMatchObject({ ok: true, role: 'host' });

    // Three tabs of one browser: each new tab says which seat the browser took last.
    const tabs = [socketFor(), socketFor(), socketFor()];
    const heard: [string, unknown][] = [];
    for (const s of tabs) s.onAny((event, payload) => void heard.push([event, payload]));
    const one = await emit(tabs[0]!, 'room:join', { code, name: 'Sam R' });
    const two = await emit(tabs[1]!, 'room:join', { code, name: 'Sam 2', deviceSeat: one.reconnectToken });
    const three = await emit(tabs[2]!, 'room:join', { code, name: 'Kit', deviceSeat: two.reconnectToken });
    expect([one, two, three].map((a) => a.ok)).toEqual([true, true, true]);
    expect(new Set([one.playerId, two.playerId, three.playerId]).size).toBe(3);
    // Someone on their own device.
    const other = socketFor();
    expect((await emit(other, 'room:join', { code, name: 'Ana' })).ok).toBe(true);
    expect(lines()).toEqual([]);

    expect(await emit(hostSock, 'room:host', { cmd: 'start', now: true })).toMatchObject({ ok: true });
    expect(lines()).toHaveLength(1);
    const [device, message] = lines()[0]!;
    expect(message).toBe('integrity signal');
    expect(device).toEqual({
      ludora_event: 'integrity',
      kind: 'one_device_many_players',
      room: code,
      mode: 'classic',
      player: 'Sam R',
      count: 3,
      detail: '3 players are connected from one browser at the same time: Sam R, Sam 2 and Kit.',
      at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
    });

    // Moves no screen sends: not a move at all, a move Classic does not have, the host's own command.
    const sock = tabs[0]!;
    expect(await emit(sock, 'room:action', 'give me points')).toEqual({ ok: false, error: { code: 'bad_request', message: 'That move was not understood.' } });
    expect(await emit(sock, 'room:action', { actionId: 'x', action: {} })).toEqual({ ok: false, error: { code: 'bad_request', message: 'That move was not understood.' } });
    for (let i = 0; i < ILLEGAL_MOVES_COUNT - 3; i++) {
      expect(await emit(sock, 'room:action', { actionId: `integrity-test-${i}`, action: { type: 'score', points: 1e9 } })).toEqual({ ok: false, error: { code: 'invalid_state', message: 'That move is not allowed here.' } });
    }
    expect(lines()).toHaveLength(1);
    expect(await emit(sock, 'room:host', { cmd: 'end' })).toEqual({ ok: false, error: { code: 'not_host', message: 'Only the host can do that.' } });
    expect(lines()).toHaveLength(2);
    expect(lines()[1]![0]).toMatchObject({ ludora_event: 'integrity', kind: 'illegal_moves', room: code, mode: 'classic', player: 'Sam R', count: ILLEGAL_MOVES_COUNT });
    // More of the same is not reported again, and the game is still on for everyone.
    expect((await emit(sock, 'room:host', { cmd: 'end' })).ok).toBe(false);
    expect(lines()).toHaveLength(2);
    const room = t.deps.rooms.get(code)!;
    expect(room.status).toBe('running');
    expect(room.players.size).toBe(4);

    // Nothing in a line identifies a device or an account.
    for (const [obj] of lines()) {
      expect(Object.keys(obj as object)).toEqual(['ludora_event', 'kind', 'room', 'mode', 'player', 'count', 'detail', 'at']);
      expect(JSON.stringify(obj)).not.toMatch(/127\.0\.0\.1|userId|ipHash|[0-9a-f]{8}-[0-9a-f]{4}-/);
    }

    // Staff see both in the audit log, under Live rooms.
    await t.deps.rooms.idle();
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.action, 'room.integrity_signal'));
    expect(rows.map((r) => [r.actorName, r.actorId, r.targetType, r.targetId, r.ipHash, (r.after as { kind: string }).kind]).sort()).toEqual([
      ['system:integrity', null, 'room', code, null, 'illegal_moves'],
      ['system:integrity', null, 'room', code, null, 'one_device_many_players'],
    ]);
    expect(rows.find((r) => (r.after as { kind: string }).kind === 'illegal_moves')).toMatchObject({
      reason: `Sam R's device sent ${ILLEGAL_MOVES_COUNT} messages that the game's own screens never send.`,
      after: { kind: 'illegal_moves', mode: 'classic', player: 'Sam R', count: ILLEGAL_MOVES_COUNT },
      before: null,
    });
    const admin = await registered(t.app);
    await t.db.insert(userRoles).values({ userId: admin.userId, role: 'superadmin', reason: 'test' });
    const log = await admin.client.get('/api/admin/audit?action=room.');
    expect(log.status).toBe(200);
    expect(log.body.entries.filter((e: { action: string }) => e.action === 'room.integrity_signal')).toHaveLength(2);
    // A player cannot read it.
    expect((await host.client.get('/api/admin/audit?action=room.')).status).toBe(403);

    // Players were sent views and nothing else, and no view mentions any of it.
    await new Promise((r) => setTimeout(r, 150));
    expect(new Set(heard.map(([event]) => event))).toEqual(new Set(['room:view']));
    expect(JSON.stringify(heard)).not.toMatch(/integrity|illegal_moves|one_device/);
  });
});
