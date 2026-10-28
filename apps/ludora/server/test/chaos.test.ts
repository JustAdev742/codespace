import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { and, eq } from 'drizzle-orm';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLLECTIONS, GLIMS } from '@ludora/content';
import { MIXED_SET } from '@ludora/engine/testing';
import { createTestApp, registered, Client, type TestContext } from './helpers.ts';
import { attachRealtime } from '../src/realtime/attach.ts';
import { auditLog, gameSessions, questionSets, users } from '../src/db/schema.ts';
import { knockBeats, makeRiddle, matchesKnock, SequenceTracker, SEQUENCE_TTL_MS } from '../src/modules/chaos/sequence.ts';
import { ALLOWED_REACTIONS } from '../src/realtime/room.ts';

/*
 * The secret chaos sequence and casting over real sockets: every stage is
 * checked by the server, a locked account gets nothing (not even a hint that
 * the routes exist), and casts change what other players see.
 */

describe('the knock', () => {
  it('derives a rhythm from the secret that differs between secrets', () => {
    const a = knockBeats('secret-one-secret-one');
    expect(a).toEqual(knockBeats('secret-one-secret-one'));
    expect(a).toHaveLength(6);
    expect(a.filter((b) => b === 2).length).toBeGreaterThanOrEqual(2);
    const many = new Set(Array.from({ length: 20 }, (_, i) => knockBeats(`secret-${i}-padding-padding`).join('')));
    expect(many.size).toBeGreaterThan(3);
  });

  it('accepts the rhythm at any steady tempo and refuses the wrong one', () => {
    const beats = [1, 2, 1, 1, 2, 1];
    expect(matchesKnock(beats.map((b) => b * 250), beats)).toBe(true);
    expect(matchesKnock(beats.map((b) => b * 400 + 30), beats)).toBe(true);
    expect(matchesKnock([250, 250, 250, 250, 250, 250], beats)).toBe(false);
    expect(matchesKnock(beats.map((b) => b * 20), beats)).toBe(false); // too fast to be a person tapping
    expect(matchesKnock(beats.slice(1).map((b) => b * 250), beats)).toBe(false);
  });
});

describe('the sequence tracker', () => {
  const beats = [1, 2, 1, 1, 2, 1];
  const gaps = beats.map((b) => b * 300);
  const make = () => {
    const clock = { t: 1_000_000 };
    const tracker = new SequenceTracker(beats, ALLOWED_REACTIONS, () => clock.t, (max) => 0 % max);
    return { tracker, clock, riddle: makeRiddle(ALLOWED_REACTIONS, (max) => 0 % max) };
  };

  it('walks knock → riddle → ritual → light, once', () => {
    const { tracker, riddle } = make();
    expect(tracker.answer('u', riddle.answer)).toEqual({ ok: false, reason: 'no-riddle' });
    expect(tracker.knock('u', gaps)).toMatchObject({ heard: true });
    expect(tracker.reaction('u', riddle.ritual[0]!, true)).toBe(false); // the ritual is not open until the riddle is solved
    expect(tracker.answer('u', ` ${riddle.answer.toUpperCase()}! `)).toEqual({ ok: true, ritual: riddle.ritual });
    expect(tracker.light('u')).toBe(false);
    // Reactions outside a running game do not count.
    for (const r of riddle.ritual) expect(tracker.reaction('u', r, false)).toBe(false);
    const done = riddle.ritual.map((r) => tracker.reaction('u', r, true));
    expect(done).toEqual([false, false, false, true]);
    expect(tracker.light('u')).toBe(true);
    expect(tracker.light('u')).toBe(false);
  });

  it('a wrong reaction in the middle restarts the ritual', () => {
    const { tracker, riddle } = make();
    tracker.knock('u', gaps);
    tracker.answer('u', riddle.answer);
    tracker.reaction('u', riddle.ritual[0]!, true);
    tracker.reaction('u', riddle.ritual[1]!, true);
    const wrong = ALLOWED_REACTIONS.find((r) => !riddle.ritual.includes(r))!;
    tracker.reaction('u', wrong, true);
    expect(tracker.stirred('u')).toBe(false);
    expect(riddle.ritual.map((r) => tracker.reaction('u', r, true)).at(-1)).toBe(true);
  });

  it('three wrong answers start everything over, and progress expires', () => {
    const { tracker, clock } = make();
    tracker.knock('u', gaps);
    expect(tracker.answer('u', 'nope')).toEqual({ ok: false, reason: 'wrong' });
    expect(tracker.answer('u', 'nope')).toEqual({ ok: false, reason: 'wrong' });
    expect(tracker.answer('u', 'nope')).toEqual({ ok: false, reason: 'reset' });
    expect(tracker.stage('u')).toBeNull();
    tracker.knock('u', gaps);
    clock.t += SEQUENCE_TTL_MS + 1;
    expect(tracker.stage('u')).toBeNull();
  });

  it('an unheard knock gives nothing away', () => {
    const { tracker } = make();
    expect(tracker.knock('u', [100, 100, 100, 100, 100, 100])).toEqual({ heard: false });
    expect(tracker.stage('u')).toBeNull();
  });
});

describe('over HTTP and sockets', () => {
  let t: TestContext;
  let base: string;
  const sockets: Socket[] = [];
  const privateDir = mkdtempSync(join(tmpdir(), 'ludora-private-'));
  writeFileSync(join(privateDir, 'chaos-menu.js'), 'export function mount() { return () => {}; }\n');

  beforeAll(async () => {
    t = await createTestApp({ WEB_PRIVATE_DIST: privateDir });
    attachRealtime(t.app, t.deps);
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(t.app.server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await t?.close();
  });

  const socketFor = (cookie?: string) => {
    const s = connect(base, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true, reconnection: false });
    sockets.push(s);
    return s;
  };
  const emit = <T = any>(s: Socket, event: string, payload: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 5000);
      s.emit(event, payload, (ack: T) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  const latestView = (s: Socket) => {
    const box: { v: any } = { v: null };
    s.on('room:view', (v) => {
      if (!box.v || v.version >= box.v.version) box.v = v;
    });
    return box;
  };
  const until = async (pred: () => boolean, ms = 8000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > ms) throw new Error('condition not met');
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const cookieOf = (c: { cookies: Map<string, string> }) => `ludora_sid=${c.cookies.get('ludora_sid')}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Solve the riddle from its text, as a player would with the collection book open. */
  function solve(text: string): string {
    const collection = COLLECTIONS.find((c) => text.includes(c.name))!;
    const n = Number(/the (\d+)(st|nd|rd|th) Glim/.exec(text)![1]);
    return GLIMS.filter((g) => g.collectionId === collection.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[n - 1]!.name;
  }

  it('hides the catalogue and the menu code from anyone who has not unlocked chaos', async () => {
    const anon = new Client(t.app);
    const unknown = await anon.get('/api/this-route-does-not-exist');
    const locked = await registered(t.app);
    for (const c of [anon, locked.client]) {
      for (const url of ['/api/lantern/book', '/api/lantern/book.js']) {
        const r = await c.get(url);
        expect(r.status).toBe(404);
        expect(r.body).toEqual(unknown.body);
      }
    }
    expect((await anon.post('/api/lantern/knock', { gaps: [1, 2, 3] })).status).toBe(401);
    expect((await locked.client.post('/api/lantern/light')).body).toEqual({ ok: false, message: 'Nothing happens.' });
  });

  it('unlocks an account through the whole sequence, then lets it cast in a live game', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const finder = await registered(t.app);
    const other = await registered(t.app);
    const [set] = await t.db.insert(questionSets).values({ ownerId: host.userId, title: 'Mixed', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length }).returning({ id: questionSets.id });

    // 1. The knock, in the rhythm the lantern flickers.
    const { beats } = (await finder.client.get('/api/lantern/flicker')).body as { beats: number[] };
    const wrong = await finder.client.post('/api/lantern/knock', { gaps: beats.map(() => 300) });
    expect(wrong.body).toEqual({ heard: false });
    const knock = await finder.client.post('/api/lantern/knock', { gaps: beats.map((b) => b * 260) });
    expect(knock.body.heard).toBe(true);

    // 2. The riddle.
    expect((await finder.client.post('/api/lantern/riddle', { answer: 'Not a Glim' })).body.ok).toBe(false);
    const solved = await finder.client.post('/api/lantern/riddle', { answer: solve(knock.body.riddle) });
    expect(solved.body.ok).toBe(true);
    const ritual = solved.body.ritual as string[];

    // 3. The ritual, in a running game.
    const code = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', common: { questionLimit: 5, questionTimeSec: 60 }, options: { chaos: true } })).body.code as string;
    const hostSock = socketFor(cookieOf(host.client));
    await emit(hostSock, 'room:join', { code });
    const fSock = socketFor(cookieOf(finder.client));
    const fView = latestView(fSock);
    const glow = new Promise((resolve) => fSock.once('room:glow', resolve));
    expect((await emit(fSock, 'room:join', { code })).ok).toBe(true);
    const oSock = socketFor(cookieOf(other.client));
    const oView = latestView(oSock);
    const joinedOther = await emit(oSock, 'room:join', { code });
    expect(await emit(hostSock, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });
    await until(() => fView.v?.room.status === 'running');
    // Before unlocking, casting does nothing and says nothing.
    expect(await emit(fSock, 'room:chaos', { op: 'cast', actionId: 'cast-early-1', casts: [{ cheatId: 'look.snow', target: joinedOther.playerId }] })).toMatchObject({ ok: false, error: { message: 'Nothing happens.' } });
    expect(fView.v.chaos).toBeUndefined();
    for (const r of ritual) {
      expect((await emit(fSock, 'room:react', { emote: r })).ok).toBe(true);
      await sleep(1600);
    }
    await glow;

    // 4. Light the lantern.
    expect((await finder.client.post('/api/lantern/light')).body).toEqual({ ok: true });
    const [row] = await t.db.select({ at: users.chaosUnlockedAt }).from(users).where(eq(users.id, finder.userId));
    expect(row!.at).toBeInstanceOf(Date);
    const audit = await t.db.select().from(auditLog).where(and(eq(auditLog.action, 'chaos.unlocked'), eq(auditLog.targetId, finder.userId)));
    expect(audit).toHaveLength(1);
    const book = await finder.client.get('/api/lantern/book');
    expect(book.status).toBe(200);
    expect(book.body.cheats.length).toBeGreaterThan(200);
    expect((await finder.client.get('/api/lantern/book.js')).res.body).toMatch(/export function mount/);

    // The open room learns about the unlock straight away.
    await until(() => Boolean(fView.v?.chaos?.me));
    expect(oView.v.chaos).toBeUndefined();

    // Cast: the target's screen is told to draw it, the caster's is not.
    const castReq = { op: 'cast', actionId: 'cast-snow-01', casts: [{ cheatId: 'look.snow', target: joinedOther.playerId }] };
    const cast = await emit(fSock, 'room:chaos', castReq);
    expect(cast).toMatchObject({ ok: true });
    expect(await emit(fSock, 'room:chaos', castReq)).toEqual(cast); // a resent request is not cast twice
    await until(() => (oView.v?.chaos?.overlays ?? []).some((o: any) => o.kind === 'look' && o.look === 'snow'));
    expect((fView.v.chaos.overlays ?? []).some((o: any) => o.look === 'snow')).toBe(false);
    expect(fView.v.chaos.me.energy).toBeLessThan(100);
    expect(await emit(fSock, 'room:chaos', { op: 'cast', actionId: 'cast-bad-01', casts: [{ cheatId: 'look.snow', target: 'nobody' }] })).toMatchObject({ ok: false });
    expect(await emit(fSock, 'room:chaos', { op: 'cast', actionId: 'bad', casts: [] })).toMatchObject({ ok: false, error: { code: 'bad_request' } });
    // The other player cannot cast, whatever they send.
    expect(await emit(oSock, 'room:chaos', { op: 'cast', actionId: 'cast-other-1', casts: [{ cheatId: 'look.snow', target: joinedOther.playerId }] })).toMatchObject({ ok: false });

    // A room whose host did not turn lantern tricks on has no chaos, even for an unlocked player.
    const calmCode = (await host.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', common: { questionLimit: 5, questionTimeSec: 60 } })).body.code as string;
    const calmHost = socketFor(cookieOf(host.client));
    await emit(calmHost, 'room:join', { code: calmCode });
    const calmFinder = socketFor(cookieOf(finder.client));
    const calmView = latestView(calmFinder);
    expect((await emit(calmFinder, 'room:join', { code: calmCode })).ok).toBe(true);
    const calmOther = socketFor(cookieOf(other.client));
    const calmTarget = await emit(calmOther, 'room:join', { code: calmCode });
    expect(await emit(calmHost, 'room:host', { cmd: 'start' })).toMatchObject({ ok: true });
    await until(() => calmView.v?.room.status === 'running');
    expect(calmView.v.chaos).toBeUndefined();
    expect(await emit(calmFinder, 'room:chaos', { op: 'cast', actionId: 'cast-calm-01', casts: [{ cheatId: 'look.snow', target: calmTarget.playerId }] })).toMatchObject({ ok: false });
    for (const s of [calmHost, calmFinder, calmOther]) s.disconnect();

    // The host calms the room: effects end and nobody can cast for the rest of the game.
    expect(await emit(hostSock, 'room:host', { cmd: 'chaosCalm' })).toMatchObject({ ok: true });
    await until(() => (oView.v?.chaos?.overlays ?? []).length === 0);
    expect(await emit(fSock, 'room:chaos', { op: 'cast', actionId: 'cast-after-1', casts: [{ cheatId: 'look.rain', target: joinedOther.playerId }] })).toMatchObject({ ok: false });

    // The game is recorded as a chaos game, and the caster earns nothing from it.
    expect(await emit(hostSock, 'room:host', { cmd: 'end' })).toMatchObject({ ok: true });
    await until(() => fView.v?.rewards && fView.v.rewards.status !== 'pending', 10_000);
    expect(fView.v.results.chaos).toBe(true);
    expect(fView.v.rewards).toMatchObject({ status: 'none', sparks: 0 });
    await t.deps.rooms.idle();
    const [game] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, code));
    expect(game!.chaos).toMatchObject({ casts: 1 });

    // Putting the lantern out locks everything again.
    expect((await finder.client.post('/api/lantern/forget')).body).toEqual({ ok: true });
    expect((await finder.client.get('/api/lantern/book')).status).toBe(404);
  }, 40_000);

  it('never runs chaos in homework', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const [set] = await t.db.insert(questionSets).values({ ownerId: host.userId, title: 'Mixed', subject: 'general', visibility: 'private', questions: MIXED_SET, questionCount: MIXED_SET.length }).returning({ id: questionSets.id });
    const room = t.deps.rooms.create({
      hostUserId: host.userId,
      hostName: 'Teacher',
      modeId: 'classic',
      variantId: null,
      settings: {},
      common: {},
      options: { lateJoin: true, maxPlayers: 30, generatedNames: false, requireAccount: false, chaos: true },
      set: { id: set!.id, title: 'Mixed', questions: MIXED_SET },
      solo: false,
      assignmentId: '00000000-0000-0000-0000-000000000001',
    });
    expect(room.chaosAllowed()).toBe(false);
    room.close('test');
  });
});
