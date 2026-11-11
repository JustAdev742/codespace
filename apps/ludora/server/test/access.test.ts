import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostCommandSchema, roomOptionsSchema, type Question } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { eq } from 'drizzle-orm';
import { questionSets, sessions } from '../src/db/schema.ts';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';
import { mergePreferences, preferencesPatchSchema, readPreferences } from '../src/modules/users/preferences.ts';

/*
 * Access features on the server: extra time for chosen players (in a room, and set once for a
 * class so it follows students into its live games), the room's little hands and read-aloud
 * switches, and the accessibility preferences saved with an account.
 */

const TF: Question[] = [
  { id: 't1', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 't2', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 't3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
];

function sub(role: 'host' | 'player', playerId: string | null) {
  const events: [string, any][] = [];
  const s: RoomSubscriber & { last: () => any } = {
    id: `${role}-${playerId ?? 'h'}`,
    role,
    playerId,
    emit: (e, p) => void events.push([e, p]),
    last: () => [...events].reverse().find(([e]) => e === 'room:view')?.[1],
  };
  return s;
}

describe('extra time in a live room', () => {
  const rooms: Room[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const r of rooms.splice(0)) r.close('test over');
    vi.useRealTimers();
  });
  function makeRoom(classExtraTime?: Record<string, number>) {
    const r = new Room(
      {
        code: '765432',
        hostUserId: 'host-user',
        hostName: 'Ms Host',
        modeId: 'classic',
        variantId: null,
        settings: {},
        common: { shuffleQuestions: false, questionLimit: 3, timeLimitSec: 20 },
        options: roomOptionsSchema.parse({}),
        set: { id: null, title: 'Facts', questions: TF },
        solo: false,
        ...(classExtraTime ? { classId: 'class-1', classMembers: Object.keys(classExtraTime), classTitle: 'Year 5', classExtraTime } : {}),
      },
      { now: () => Date.now(), persist: async () => null, onError: () => {}, onClosed: () => {} },
    );
    rooms.push(r);
    return r;
  }
  const join = (room: Room, name: string, userId: string | null = null) => {
    const j = room.join({ name, userId, accountName: userId ? name : null, isGuestAccount: !userId, avatar: null });
    if (!j.ok) throw new Error(j.error.message);
    const s = sub('player', j.player.id);
    room.subscribe(s);
    return { id: j.player.id, sub: s };
  };

  it('gives one player a longer clock that only they and the host know about', () => {
    const room = makeRoom();
    const host = sub('host', null);
    room.subscribe(host);
    const ana = join(room, 'Ana');
    const ben = join(room, 'Ben');
    expect(hostCommandSchema.safeParse({ cmd: 'extraTime', playerId: ben.id, share: 0.3 }).success).toBe(false);
    expect(room.hostCommand({ cmd: 'extraTime', playerId: 'nobody', share: 0.5 }).ok).toBe(false);
    expect(room.hostCommand({ cmd: 'extraTime', playerId: ben.id, share: 0.5 }).ok).toBe(true);
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    vi.advanceTimersByTime(4100);
    const views = () => [host.last(), ana.sub.last(), ben.sub.last()];
    const [h, a, b] = views();
    const shared = h.game.sync.question.deadline;
    expect(a.game.sync.question.deadline).toBe(shared);
    expect(b.game.sync.question.deadline).toBe(shared + 10_000);
    // The host sees who has extra time; players never get the list, and nothing goes in the news.
    expect(h.host.extraTime).toEqual({ [ben.id]: 0.5 });
    expect(a.host).toBeUndefined();
    expect(b.host).toBeUndefined();
    expect(JSON.stringify(a)).not.toMatch(/extraTime/);
    expect(JSON.stringify(h.feed)).not.toMatch(/extra/i);
    // After the shared time, the round is still open for Ben alone.
    vi.advanceTimersByTime(21_000);
    const state = () => (room.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
    expect(state().phase).toBe('question');
    const iid = state().iid;
    const reveal = room.runtime!.debugReveal(iid) as { correct: boolean };
    expect(room.action(ana.id, 'late-ana-xxxxxxxx', { type: 'answer', iid, answer: { type: 'truefalse', value: reveal.correct } }).ok).toBe(false);
    expect(room.action(ben.id, 'late-ben-xxxxxxxx', { type: 'answer', iid, answer: { type: 'truefalse', value: reveal.correct } }).ok).toBe(true);
    expect(state().phase).toBe('reveal');
  });

  it('applies the extra time a class teacher set to that student as they join', () => {
    const room = makeRoom({ 'user-stu': 1, 'user-other': 0 });
    const host = sub('host', null);
    room.subscribe(host);
    const stu = join(room, 'Stu', 'user-stu');
    join(room, 'Other', 'user-other');
    vi.advanceTimersByTime(100);
    expect(host.last().host.extraTime).toEqual({ [stu.id]: 1 });
    expect(room.hostCommand({ cmd: 'extraTime', playerId: stu.id, share: 0 }).ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(host.last().host.extraTime).toEqual({});
  });

  it('lets the host turn on little hands and the big screen reading aloud, during a game too', () => {
    const room = makeRoom();
    const p = join(room, 'Ana');
    expect(room.hostCommand({ cmd: 'configure', options: { littleHands: true } }).ok).toBe(true);
    expect(room.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    expect(room.hostCommand({ cmd: 'configure', options: { readAloud: true } }).ok).toBe(true);
    vi.advanceTimersByTime(100);
    expect(p.sub.last().room.options).toMatchObject({ littleHands: true, readAloud: true });
  });
});

describe('accessibility preferences', () => {
  it('default to how the app behaved before, and one change keeps the rest', () => {
    const fresh = readPreferences({});
    expect(fresh.access).toMatchObject({ readAloud: false, timer: 'both', tiles: 'standard', calm: false, dataSaver: 'auto', timeZone: null, locale: 'en-GB', littleHands: false });
    const a = mergePreferences(fresh, preferencesPatchSchema.parse({ access: { calm: true } }));
    const b = mergePreferences(a, preferencesPatchSchema.parse({ access: { timer: 'hidden' } }));
    expect(b.access).toMatchObject({ calm: true, timer: 'hidden' });
    expect(b.theme).toBe('system');
  });

  it('refuses a time zone that does not exist, and an unreadable stored choice costs nothing else', () => {
    expect(preferencesPatchSchema.safeParse({ access: { timeZone: 'Mars/Olympus' } }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ access: { timeZone: 'Europe/London' } }).success).toBe(true);
    const stored = readPreferences({ textSize: 'larger', access: { timer: 'sideways' } });
    expect(stored.textSize).toBe('larger');
    expect(stored.access.timer).toBe('both');
  });
});

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('class extra time', () => {
  it('is set and seen by the class teacher only, and follows the student into class games', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const otherTeacher = await registered(t.app, { accountType: 'teacher' });
    const student = await registered(t.app, { accountType: 'student' });
    const outsider = await registered(t.app);
    const made = await teacher.client.post('/api/classes', { name: 'Year 4 Elm' });
    const classId = made.body.class.id as string;
    await student.client.post('/api/classes/join', { code: made.body.class.joinCode });

    expect((await student.client.put(`/api/classes/${classId}/extra-time/${student.userId}`, { percent: 100 })).status).toBe(403);
    expect((await otherTeacher.client.put(`/api/classes/${classId}/extra-time/${student.userId}`, { percent: 100 })).status).toBe(404);
    expect((await student.client.get(`/api/classes/${classId}/extra-time`)).status).toBe(403);
    expect((await otherTeacher.client.get(`/api/classes/${classId}/extra-time`)).status).toBe(404);
    expect((await teacher.client.put(`/api/classes/${classId}/extra-time/${student.userId}`, { percent: 30 })).status).toBe(400);
    expect((await teacher.client.put(`/api/classes/${classId}/extra-time/${outsider.userId}`, { percent: 50 })).status).toBe(404);
    expect((await teacher.client.put(`/api/classes/${classId}/extra-time/${student.userId}`, { percent: 50 })).status).toBe(200);
    expect((await teacher.client.get(`/api/classes/${classId}/extra-time`)).body.extraTime).toEqual({ [student.userId]: 50 });

    const [set] = await t.db.insert(questionSets).values({ ownerId: teacher.userId, title: 'Facts', subject: 'general', visibility: 'private', questions: TF, questionCount: TF.length }).returning({ id: questionSets.id });
    const hosted = await teacher.client.post('/api/rooms', { setId: set!.id, modeId: 'classic', classId });
    expect(hosted.status).toBe(200);
    const room = t.deps.rooms.get(hosted.body.code) as Room;
    expect(room.classExtraTime).toEqual({ [student.userId]: 0.5 });
    const joined = room.join({ name: 'Stu', userId: student.userId, accountName: 'Stu', isGuestAccount: false, avatar: null });
    expect(joined.ok).toBe(true);
    expect(room.view(null).host?.extraTime).toEqual({ [(joined as { player: { id: string } }).player.id]: 0.5 });
  });
});

describe('signing in on a shared device', () => {
  it('gives a cookie that ends with the browser and a session that ends after 30 minutes without use', async () => {
    const acct = await registered(t.app);
    const plain = new Client(t.app);
    const normal = await plain.post('/api/auth/login', { username: acct.username, password: acct.password });
    expect(String(normal.res.headers['set-cookie'])).toMatch(/Max-Age=/);

    const device = new Client(t.app);
    const shared = await device.post('/api/auth/login', { username: acct.username, password: acct.password, shared: true });
    expect(shared.status).toBe(200);
    expect(String(shared.res.headers['set-cookie'])).not.toMatch(/Max-Age=|Expires=/);
    expect((await device.get('/api/auth/me')).body.user.id).toBe(acct.userId);
    const rows = await t.db.select().from(sessions).where(eq(sessions.userId, acct.userId));
    const mine = rows.filter((r) => r.shared);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 5_000);
    // Thirty minutes without use: the session has ended.
    await t.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, mine[0]!.id));
    expect((await device.get('/api/auth/me')).body.user).toBeNull();
    // The ordinary session on the other device is untouched.
    expect((await plain.get('/api/auth/me')).body.user.id).toBe(acct.userId);
  });
});
