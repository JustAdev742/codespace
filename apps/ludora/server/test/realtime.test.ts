import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { MIXED_SET } from '@ludora/engine/testing';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { answerEvents, gameParticipants, gameSessions, ledger, questionSets } from '../src/db/schema.ts';

let t: TestContext;
let base: string;

beforeAll(async () => {
  t = await createTestApp();
  attachRealtime(t.app, t.deps);
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = t.app.server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
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

/** Resolves with the first view (including the latest one already received) matching `pred`. */
function trackViews(s: Socket) {
  let latest: any = null;
  const waiters: { pred: (v: any) => boolean; resolve: (v: any) => void }[] = [];
  s.on('room:view', (v) => {
    if (latest && v.version < latest.version) return;
    latest = v;
    for (const w of [...waiters]) if (w.pred(v)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(v);
    }
  });
  return {
    get latest() {
      return latest;
    },
    until(pred: (v: any) => boolean, ms = 8000): Promise<any> {
      if (latest && pred(latest)) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`view condition not met; last view: ${JSON.stringify(latest?.game ?? latest?.room?.status)}`)), ms);
        waiters.push({ pred, resolve: (v) => (clearTimeout(timer), resolve(v)) });
      });
    },
  };
}

async function createSet(ownerId: string) {
  const [row] = await t.db
    .insert(questionSets)
    .values({ ownerId, title: 'Mixed bag', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length })
    .returning({ id: questionSets.id });
  return row!.id;
}

const cookieOf = (c: { cookies: Map<string, string> }) => `ludora_sid=${c.cookies.get('ludora_sid')}`;

describe('hosting and playing Classic over sockets', () => {
  it('runs a full game: lobby, answers, reveals, results, persistence and rewards', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const signedIn = await registered(t.app);
    const setId = await createSet(host.userId);

    const created = await host.client.post('/api/rooms', { setId, modeId: 'classic', common: { questionLimit: 3, questionTimeSec: 10 } });
    expect(created.status).toBe(200);
    const code = created.body.code as string;
    expect(code).toMatch(/^\d{6}$/);

    const preview = await new (await import('./helpers.ts')).Client(t.app).get(`/api/rooms/${code}`);
    expect(preview.body).toMatchObject({ title: 'Classic', joinable: true });

    const hostSock = socketFor(cookieOf(host.client));
    const hostViews = trackViews(hostSock);
    expect(await emit(hostSock, 'room:join', { code })).toMatchObject({ ok: true, role: 'host' });

    const aSock = socketFor(cookieOf(signedIn.client));
    const aViews = trackViews(aSock);
    const a = await emit(aSock, 'room:join', { code });
    expect(a).toMatchObject({ ok: true, role: 'player' });

    const bSock = socketFor();
    const bViews = trackViews(bSock);
    const b = await emit(bSock, 'room:join', { code, name: 'Quiet Fern' });
    expect(b.ok).toBe(true);

    const rude = await emit(socketFor(), 'room:join', { code, name: 'poopfuck' });
    expect(rude.ok).toBe(false);
    expect(await emit(socketFor(), 'room:join', { code: '000000' })).toMatchObject({ ok: false, error: { code: 'room_not_found' } });

    const lobby = await hostViews.until((v) => v.players.length === 2);
    expect(lobby.room.status).toBe('lobby');
    expect(lobby.players.map((p: any) => p.name)).toContain('Quiet Fern');

    // Only the host can start.
    expect(await emit(aSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: false, error: { code: 'not_host' } });
    expect(await emit(hostSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });

    // Skip the intro, then play three rounds.
    await hostViews.until((v) => v.game?.sync?.phase === 'intro');
    await emit(hostSock, 'room:host', { cmd: 'next' });
    for (let round = 0; round < 3; round++) {
      const av = await aViews.until((v) => v.game?.sync?.phase === 'question' && v.game.sync.round === round);
      const q = av.game.sync.question;
      // The player's payload never includes the answer.
      expect(JSON.stringify(av)).not.toMatch(/"correct":\s*"[a-z]"/);
      const answer = q.q.type === 'mcq' ? { type: 'mcq', choiceId: q.q.choices[0].id } : q.q.type === 'truefalse' ? { type: 'truefalse', value: true } : q.q.type === 'short' ? { type: 'short', text: 'Paris' } : q.q.type === 'numeric' ? { type: 'numeric', value: 56 } : q.q.type === 'order' ? { type: 'order', itemIds: q.q.items.map((i: any) => i.id) } : q.q.type === 'match' ? { type: 'match', pairs: Object.fromEntries(q.q.left.map((l: any, i: number) => [l.id, q.q.right[i].id])) } : { type: 'multi', choiceIds: [q.q.choices[0].id] };
      const actionId = `act-${round}-a-xyz`;
      expect(await emit(aSock, 'room:action', { actionId, action: { type: 'answer', iid: q.iid, answer } })).toMatchObject({ ok: true });
      // Resending the same action id is answered from the cache, not processed twice.
      expect(await emit(aSock, 'room:action', { actionId, action: { type: 'answer', iid: q.iid, answer } })).toMatchObject({ ok: true });
      const bv = await bViews.until((v) => v.game?.sync?.phase === 'question' && v.game.sync.round === round);
      await emit(bSock, 'room:action', { actionId: `act-${round}-b-xyz`, action: { type: 'answer', iid: bv.game.sync.question.iid, answer } });
      await hostViews.until((v) => v.game?.sync?.phase === 'reveal' && v.game.sync.round === round);
      await emit(hostSock, 'room:host', { cmd: 'next' });
      if (round < 2) {
        await hostViews.until((v) => v.game?.sync?.phase === 'leaderboard');
        await emit(hostSock, 'room:host', { cmd: 'next' });
      }
    }

    const ended = await aViews.until((v) => v.room.status === 'ended' && v.rewards && v.rewards.status !== 'pending', 10_000);
    expect(ended.results.standings).toHaveLength(2);
    expect(ended.rewards.status).toBe('granted');
    expect(ended.rewards.sparks).toBeGreaterThan(0);
    const anon = await bViews.until((v) => v.room.status === 'ended' && v.rewards && v.rewards.status !== 'pending', 10_000);
    expect(anon.rewards.status).toBe('none');

    await t.deps.rooms.idle();
    const games = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, code));
    expect(games).toHaveLength(1);
    const parts = await t.db.select().from(gameParticipants).where(eq(gameParticipants.gameId, games[0]!.id));
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.userId === signedIn.userId)?.answered).toBe(3);
    const answers = await t.db.select().from(answerEvents).where(eq(answerEvents.gameId, games[0]!.id));
    expect(answers).toHaveLength(6);
    const rewards = await t.db.select().from(ledger).where(eq(ledger.userId, signedIn.userId));
    expect(rewards.some((l) => l.reason === 'game_reward' && l.refId === games[0]!.id)).toBe(true);
    // The host hosted a two-player game and gets hosting credit, not player rewards.
    const hostLedger = await t.db.select().from(ledger).where(eq(ledger.userId, host.userId));
    expect(hostLedger.some((l) => l.reason === 'game_reward')).toBe(false);
  }, 60_000);

  it('lets a player reconnect into the same slot and refuses kicked players', async () => {
    const host = await registered(t.app);
    const setId = await createSet(host.userId);
    const { body } = await host.client.post('/api/rooms', { setId, modeId: 'comet-dash' });
    const hostSock = socketFor(cookieOf(host.client));
    await emit(hostSock, 'room:join', { code: body.code });

    const p1 = socketFor();
    const first = await emit(p1, 'room:join', { code: body.code, name: 'Lucky Heron' });
    p1.close();
    const p1again = socketFor();
    const again = await emit(p1again, 'room:join', { code: body.code, reconnectToken: first.reconnectToken });
    expect(again).toMatchObject({ ok: true, playerId: first.playerId, resumed: true });

    const p2 = socketFor();
    const second = await emit(p2, 'room:join', { code: body.code, name: 'Brave Yak' });
    expect(await emit(hostSock, 'room:host', { cmd: 'kick', playerId: second.playerId })).toMatchObject({ ok: true });
    const back = await emit(socketFor(), 'room:join', { code: body.code, reconnectToken: second.reconnectToken });
    expect(back).toMatchObject({ ok: false, error: { code: 'forbidden' } });

    expect(await emit(hostSock, 'room:host', { cmd: 'lock', locked: true })).toMatchObject({ ok: true });
    expect(await emit(socketFor(), 'room:join', { code: body.code, name: 'Late Comer' })).toMatchObject({ ok: false, error: { code: 'room_locked' } });
  });

  it('plays a self-paced game with practice bots to the end', async () => {
    const host = await registered(t.app);
    const setId = await createSet(host.userId);
    const { body } = await host.client.post('/api/rooms', { setId, modeId: 'comet-dash', settings: { distance: 8, finishers: 1 } });
    const hostSock = socketFor(cookieOf(host.client));
    const views = trackViews(hostSock);
    await emit(hostSock, 'room:join', { code: body.code });
    expect(await emit(hostSock, 'room:host', { cmd: 'addBots', count: 3 })).toMatchObject({ ok: true });
    await views.until((v) => v.players.length === 3);
    expect(await emit(hostSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });
    // Bots answer every few seconds; a short track finishes well within the timeout.
    const ended = await views.until((v) => v.room.status === 'ended', 45_000);
    expect(ended.results.standings[0].label).toBe('Finished 1st');
  }, 60_000);

  it('rejects creating rooms from private sets of other users and unknown modes', async () => {
    const owner = await registered(t.app);
    const other = await registered(t.app);
    const setId = await createSet(owner.userId);
    expect((await other.client.post('/api/rooms', { setId, modeId: 'classic' })).status).toBe(403);
    expect((await owner.client.post('/api/rooms', { setId, modeId: 'no-such-mode' })).status).toBe(404);
  });

  it('starts a solo game as soon as its player joins', async () => {
    const me = await registered(t.app);
    const setId = await createSet(me.userId);
    const { body } = await me.client.post('/api/rooms', { setId, modeId: 'comet-dash', solo: true });
    expect(body.solo).toBe(true);
    const s = socketFor(cookieOf(me.client));
    const views = trackViews(s);
    expect(await emit(s, 'room:join', { code: body.code })).toMatchObject({ ok: true, role: 'player' });
    const v = await views.until((x) => x.room.status === 'running');
    expect(v.game.you.question).toBeTruthy();
    expect(await emit(socketFor(), 'room:join', { code: body.code, name: 'Gate Crasher' })).toMatchObject({ ok: false });
  });
});
