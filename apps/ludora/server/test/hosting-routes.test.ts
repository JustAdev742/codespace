import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { classes, gameSessions, questionSets } from '../src/db/schema.ts';
import type { Room } from '../src/realtime/room.ts';

/*
 * Hosting routes: hosting for a class (members only, checked on the server), the class's attendance
 * for its live games, right answers in class games counting toward the class goal, class hosting
 * defaults, "Play the missed questions again", "Practise these questions on your own" and
 * "Host again" from a past game. Each is checked against the wrong account.
 */

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

type Account = Awaited<ReturnType<typeof registered>>;
const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Ice is hotter than steam.', correct: false },
  { id: 'q5', type: 'truefalse', prompt: 'Owls hunt at night.', correct: true },
];

let teacher: Account;
let otherTeacher: Account;
let student: Account;
let outsider: Account;
let classId: string;
let setId: string;

beforeAll(async () => {
  teacher = await registered(t.app, { accountType: 'teacher' });
  otherTeacher = await registered(t.app, { accountType: 'teacher' });
  student = await registered(t.app, { accountType: 'student' });
  outsider = await registered(t.app);
  const made = await teacher.client.post('/api/classes', { name: 'Year 6 Ash' });
  classId = made.body.class.id;
  await student.client.post('/api/classes/join', { code: made.body.class.joinCode });
  const [set] = await t.db.insert(questionSets).values({ ownerId: teacher.userId, title: 'Facts', subject: 'general', visibility: 'private', questions: QUESTIONS, questionCount: QUESTIONS.length }).returning({ id: questionSets.id });
  setId = set!.id;
});

const room = (code: string) => t.deps.rooms.get(code) as Room;

/** Play a room's classic game: each listed player answers every question right or wrong, then the host ends it. */
async function play(r: Room, players: { id: string; right: boolean }[]) {
  expect(r.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
  for (let i = 0; i < 5; i++) {
    const state = r.runtime!.debugState() as { sync: { phase: string; iid: string } };
    if (state.sync.phase !== 'question') r.hostCommand({ cmd: 'next' });
    const s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
    if (s.phase !== 'question') break;
    const reveal = r.runtime!.debugReveal(s.iid) as { correct: boolean };
    for (const p of players) r.action(p.id, `a-${p.id}-${i}-xxxxxx`, { type: 'answer', iid: s.iid, answer: { type: 'truefalse', value: p.right ? reveal.correct : !reveal.correct } });
    r.hostCommand({ cmd: 'next' });
  }
  if (r.status !== 'ended') r.hostCommand({ cmd: 'end' });
  await t.deps.rooms.idle();
}

describe('hosting for a class', () => {
  it('only the class teacher can host for it, and only its members can join', async () => {
    expect((await otherTeacher.client.post('/api/rooms', { setId, modeId: 'classic', classId })).status).toBe(404);
    expect((await student.client.post('/api/rooms', { setId, modeId: 'classic', classId })).status).toBe(403);
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', classId });
    expect(made.status).toBe(200);
    const r = room(made.body.code);
    expect(r.classId).toBe(classId);
    expect(r.classTitle).toBe('Year 6 Ash');
    expect(r.join({ name: 'Out', userId: outsider.userId, accountName: 'Out', isGuestAccount: false, avatar: null }).ok).toBe(false);
    expect(r.join({ name: 'Guest', userId: null, accountName: null, isGuestAccount: true, avatar: null }).ok).toBe(false);
    expect(r.join({ name: 'Stu', userId: student.userId, accountName: 'Stu', isGuestAccount: false, avatar: null }).ok).toBe(true);
    // Someone added to the class after the room opened is found in the database.
    expect(await t.deps.rooms.isClassMember(classId, student.userId)).toBe(true);
    expect(await t.deps.rooms.isClassMember(classId, outsider.userId)).toBe(false);
    r.close('test');
  });

  it('records attendance for each class game, right answers count toward the class goal, and only the teacher sees attendance', async () => {
    await teacher.client.put(`/api/classes/${classId}/goal`, { title: 'Twenty right', target: 20, endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    const before = (await student.client.get(`/api/classes/${classId}`)).body.goal.progress as number;
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', classId });
    const r = room(made.body.code);
    const j = r.join({ name: 'Stu', userId: student.userId, accountName: 'Stu', isGuestAccount: false, avatar: null });
    if (!j.ok) throw new Error(j.error.message);
    await play(r, [{ id: j.player.id, right: true }]);
    const [saved] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, made.body.code));
    expect(saved?.classId).toBe(classId);
    const after = (await student.client.get(`/api/classes/${classId}`)).body.goal.progress as number;
    expect(after).toBeGreaterThan(before);

    const live = await teacher.client.get(`/api/classes/${classId}/live-games`);
    expect(live.status).toBe(200);
    expect(live.body.games[0].present.map((p: { id: string }) => p.id)).toEqual([student.userId]);
    expect(live.body.games[0].absent).toEqual([]);
    expect((await student.client.get(`/api/classes/${classId}/live-games`)).status).toBe(403);
    expect((await outsider.client.get(`/api/classes/${classId}/live-games`)).status).toBe(404);
    expect((await otherTeacher.client.get(`/api/classes/${classId}/live-games`)).status).toBe(404);
  });

  it('keeps hosting defaults for the class, for its teacher only', async () => {
    expect((await student.client.patch(`/api/classes/${classId}`, { hostDefaults: { quiet: true } })).status).toBe(403);
    expect((await teacher.client.patch(`/api/classes/${classId}`, { hostDefaults: { generatedNames: true, quiet: true } })).status).toBe(200);
    const view = await teacher.client.get(`/api/classes/${classId}`);
    expect(view.body.class.hostDefaults).toEqual({ generatedNames: true, quiet: true });
    expect((await student.client.get(`/api/classes/${classId}`)).body.class.hostDefaults).toBeUndefined();
    const [row] = await t.db.select().from(classes).where(eq(classes.id, classId));
    expect(row?.hostQuiet).toBe(true);
  });
});

describe('after a game', () => {
  it('Play the missed questions again makes a new room for the host with only the missed questions', async () => {
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', options: { quiet: true } });
    const r = room(made.body.code);
    const a = r.join({ name: 'Ana', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!a.ok) throw new Error(a.error.message);
    expect((await teacher.client.post(`/api/rooms/${made.body.code}/missed`)).status).toBe(409);
    await play(r, [{ id: a.player.id, right: false }]);
    expect((await otherTeacher.client.post(`/api/rooms/${made.body.code}/missed`)).status).toBe(404);
    const again = await teacher.client.post(`/api/rooms/${made.body.code}/missed`);
    expect(again.status).toBe(200);
    const next = room(again.body.code);
    // Every question was missed; a game too short for the mode would be topped up from the set.
    expect(next.set.questions.length).toBe(again.body.questions + again.body.extra);
    expect(again.body.questions).toBe(5);
    expect(next.set.questions.length).toBeGreaterThan(0);
    expect(next.set.title).toMatch(/missed questions/);
    expect(next.options.quiet).toBe(true);
    next.close('test');
  });

  it('a single missed question is topped up from the set to make a game', async () => {
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', common: { questionLimit: 1, shuffleQuestions: false } });
    const r = room(made.body.code);
    const a = r.join({ name: 'Ana', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!a.ok) throw new Error(a.error.message);
    await play(r, [{ id: a.player.id, right: false }]);
    const again = await teacher.client.post(`/api/rooms/${made.body.code}/missed`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ questions: 1, extra: 2 });
    const next = room(again.body.code);
    expect(next.set.questions[0]!.id).toBe('q1');
    next.close('test');
  });

  it('Practise these questions on your own starts a solo game for someone who was in the room, and nobody else', async () => {
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic' });
    const r = room(made.body.code);
    const a = r.join({ name: 'Ana', userId: outsider.userId, accountName: 'Ana', isGuestAccount: false, avatar: null });
    if (!a.ok) throw new Error(a.error.message);
    expect((await outsider.client.post(`/api/rooms/${made.body.code}/practice`, { reconnectToken: 'x'.repeat(32) })).status).toBe(404);
    const solo = await outsider.client.post(`/api/rooms/${made.body.code}/practice`, { reconnectToken: a.player.reconnectToken });
    expect(solo.status).toBe(200);
    const practice = room(solo.body.code);
    expect(practice.solo).toBe(true);
    expect(practice.hostUserId).toBe(outsider.userId);
    expect(practice.set.questions).toHaveLength(QUESTIONS.length);
    practice.close('test');
    r.close('test');
  });

  it('Host again: a past game\'s report carries its setup for the host only', async () => {
    const made = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', common: { questionTimeSec: 30 }, options: { hideNames: true } });
    const r = room(made.body.code);
    const a = r.join({ name: 'Ana', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    const b = r.join({ name: 'Ben', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!a.ok || !b.ok) throw new Error('join');
    await play(r, [
      { id: a.player.id, right: true },
      { id: b.player.id, right: false },
    ]);
    const [saved] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, made.body.code));
    const report = await teacher.client.get(`/api/games/${saved!.id}/report`);
    expect(report.body.setup).toMatchObject({ setId, modeId: 'classic', common: { questionTimeSec: 30 }, options: { hideNames: true } });
    expect((await otherTeacher.client.get(`/api/games/${saved!.id}/report`)).status).toBe(404);
  });
});
