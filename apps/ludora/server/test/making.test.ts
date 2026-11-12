import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { eq } from 'drizzle-orm';
import { answerEvents, gameParticipants, gameSessions, questionSets } from '../src/db/schema.ts';
import { cleanToolState, sortWork } from '../src/modules/making/today.ts';
import { stepMinutes } from '../src/modules/lessons/model.ts';
import { screenFor } from '../src/modules/lessons/run.ts';
import { lessonStepSchema } from '@ludora/shared';

/*
 * The Make page's routes (making): drafts that carry on from any device, help closed for good,
 * the teacher's day, and the classroom tools' memory. Every route refuses the wrong account.
 */

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q2', type: 'short', prompt: 'Capital of France?', accepted: ['Paris'] },
];

describe('the teacher’s day, worked out', () => {
  const from = new Date('2026-03-04T00:00:00Z');
  const to = new Date('2026-03-05T00:00:00Z');
  const w = (title: string, due: string | null, students = 4, done = 0) => ({ id: title, classId: 'c', className: 'Oak', title, dueAt: due ? new Date(due) : null, students, done });
  it('sorts work into today, the next week and what to follow up', () => {
    const r = sortWork([w('today', '2026-03-04T15:00:00Z'), w('soon', '2026-03-07T09:00:00Z'), w('late, all done', '2026-03-02T09:00:00Z', 4, 4), w('late', '2026-03-03T09:00:00Z', 4, 1), w('later', '2026-03-03T10:00:00Z', 4, 3), w('long ago', '2026-01-01T09:00:00Z'), w('no date', null)], from, to);
    expect(r.dueToday.map((x) => x.title)).toEqual(['today']);
    expect(r.dueSoon.map((x) => x.title)).toEqual(['soon']);
    // Most students missing first; finished work and work from long ago are left out.
    expect(r.followUp.map((x) => x.title)).toEqual(['late', 'later']);
  });
  it('remembers only students still in the class', () => {
    expect(cleanToolState({ picked: ['a', 'b', 'a', 'gone'], scores: [] }, new Set(['a', 'b'])).picked).toEqual(['a', 'b']);
  });
});

describe('a classroom tool as a lesson step', () => {
  const slide = { id: 's1', kind: 'slide', title: 'How are we doing?', lines: ['Hold up a colour'], image: null, tool: { kind: 'checkin', seconds: 240 }, note: 'secret plan' };
  it('is a slide that carries a tool, planned for its time, and reaches the room without the plan note', () => {
    const step = lessonStepSchema.parse(slide);
    expect(stepMinutes(step, null)).toBe(4);
    expect(stepMinutes(lessonStepSchema.parse({ ...slide, tool: undefined }), null)).toBe(2);
    const screen = screenFor(step, 0);
    expect(screen).toEqual({ kind: 'slide', title: 'How are we doing?', lines: ['Hold up a colour'], image: null, tool: { kind: 'checkin', seconds: 240 } });
    expect(JSON.stringify(screen)).not.toContain('secret plan');
    expect(lessonStepSchema.safeParse({ ...slide, tool: { kind: 'confetti', seconds: 60 } }).success).toBe(false);
    expect(lessonStepSchema.safeParse({ ...slide, tool: { kind: 'timer', seconds: 5 } }).success).toBe(false);
  });
  it('saves with a lesson for its owner only', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const id = (await teacher.client.post('/api/lessons', { title: 'With a tool' })).body.id as string;
    const put = await teacher.client.put(`/api/lessons/${id}`, { title: 'With a tool', goals: [], standings: true, steps: [slide] });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const got = await teacher.client.get(`/api/lessons/${id}`);
    expect(got.body.lesson.steps[0].tool).toEqual({ kind: 'checkin', seconds: 240 });
    const other = await registered(t.app, { accountType: 'teacher' });
    expect((await other.client.put(`/api/lessons/${id}`, { title: 'Mine', goals: [], standings: true, steps: [slide] })).status).toBe(404);
  });
});

describe('making routes', () => {
  it('saves a draft, carries it on from another device and keeps it from everyone else', async () => {
    const me = await registered(t.app, { accountType: 'teacher' });
    const other = await registered(t.app);
    const made = await me.client.post('/api/making/drafts', { title: 'Cells', text: 'A cell is the smallest unit of life.', questions: QUESTIONS, step: 'choose' });
    expect(made.status).toBe(200);
    const id = made.body.draft.id as string;
    // The same account signed in somewhere else sees it.
    const second = new Client(t.app);
    expect((await second.post('/api/auth/login', { username: me.username, password: me.password })).status).toBe(200);
    const got = await second.get(`/api/making/drafts/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.draft.body.questions).toHaveLength(2);
    expect(got.body.draft.body.step).toBe('choose');
    const saved = await second.put(`/api/making/drafts/${id}`, { title: 'Cells and more', text: 'x', questions: [QUESTIONS[0]], step: 'choose' });
    expect(saved.status).toBe(200);
    const o = await me.client.get('/api/making/overview');
    expect(o.body.drafts).toEqual([expect.objectContaining({ id, title: 'Cells and more', questions: 1 })]);
    // Anyone else: as if it did not exist.
    expect((await other.client.get(`/api/making/drafts/${id}`)).status).toBe(404);
    expect((await other.client.put(`/api/making/drafts/${id}`, { title: 'mine now' })).status).toBe(404);
    expect((await other.client.delete(`/api/making/drafts/${id}`)).status).toBe(404);
    expect((await other.client.get('/api/making/overview')).body.drafts).toEqual([]);
    // Questions are checked like a set's.
    expect((await me.client.put(`/api/making/drafts/${id}`, { questions: [{ id: 'x', type: 'mcq', prompt: 'Broken', choices: [], correct: 'a' }] })).status).toBe(400);
    expect((await me.client.delete(`/api/making/drafts/${id}`)).status).toBe(200);
    expect((await me.client.get(`/api/making/drafts/${id}`)).status).toBe(404);
  });

  it('keeps at most twenty drafts and refuses guests and the signed out', async () => {
    const me = await registered(t.app);
    for (let i = 0; i < 20; i++) expect((await me.client.post('/api/making/drafts', { title: `D${i}` })).status).toBe(200);
    const full = await me.client.post('/api/making/drafts', { title: 'one too many' });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/Throw away one/);
    const anon = new Client(t.app);
    expect((await anon.get('/api/making/overview')).status).toBe(401);
    expect((await anon.post('/api/making/drafts', {})).status).toBe(401);
  });

  it('lists what the account made lately, with counts', async () => {
    const me = await registered(t.app, { accountType: 'teacher' });
    const set = await me.client.post('/api/sets', { title: 'Animals', subject: 'science', questions: QUESTIONS });
    expect(set.status).toBe(200);
    const o = await me.client.get('/api/making/overview');
    expect(o.status).toBe(200);
    expect(o.body.recent[0]).toMatchObject({ kind: 'set', title: 'Animals', detail: '2 questions' });
    expect(o.body.counts).toMatchObject({ sets: 1, lessons: 0, classes: 0, hosted: 0 });
    // Another account's sets never appear.
    const other = await registered(t.app);
    expect((await other.client.get('/api/making/overview')).body.recent).toEqual([]);
  });

  it('closes help for good, for known keys only', async () => {
    const me = await registered(t.app);
    expect((await me.client.post('/api/making/help/make-start/dismiss')).status).toBe(200);
    expect((await me.client.post('/api/making/help/make-start/dismiss')).body.dismissed).toEqual(['make-start']);
    expect((await me.client.post('/api/making/help/anything/dismiss')).status).toBe(400);
    expect((await me.client.get('/api/making/overview')).body.dismissed).toEqual(['make-start']);
  });

  it('gives a teacher their day: lessons, homework due and who to follow up', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const s1 = await registered(t.app, { accountType: 'student' });
    const s2 = await registered(t.app, { accountType: 'student' });
    const cls = (await teacher.client.post('/api/classes', { name: 'Year 6 Ash' })).body.class;
    await s1.client.post('/api/classes/join', { code: cls.joinCode });
    await s2.client.post('/api/classes/join', { code: cls.joinCode });
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, type: 'truefalse', prompt: `Statement number ${i + 1} is true.`, correct: true }));
    const setId = (await teacher.client.post('/api/sets', { title: 'Quiz', subject: 'science', questions: many })).body.set.id;
    const now = Date.now();
    const from = new Date(now - 3_600_000);
    const to = new Date(now + 20 * 3_600_000);
    const today = await teacher.client.post(`/api/classes/${cls.id}/assignments`, { setId, modeId: 'classic', title: 'Due today', dueAt: new Date(now + 3_600_000).toISOString() });
    expect(today.status, JSON.stringify(today.body)).toBe(200);
    const late = await teacher.client.post(`/api/classes/${cls.id}/assignments`, { setId, modeId: 'classic', title: 'Was due', dueAt: new Date(now - 2 * 86_400_000).toISOString() });
    expect(late.status).toBe(200);
    const lateId = late.body.assignment.id as string;
    // One of the two students has played the late one.
    const [g] = await t.db.insert(gameSessions).values({ roomCode: '123456', modeId: 'classic', hostUserId: s1.userId, setId, setTitle: 'Quiz', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, classId: cls.id, assignmentId: lateId, isSolo: true, startedAt: new Date(), endedAt: new Date(), durationMs: 1000 }).returning();
    await t.db.insert(gameParticipants).values({ gameId: g!.id, userId: s1.userId, playerKey: 'p0', displayName: 'S', isGuest: false, isBot: false, rank: 1, score: 100, label: '', answered: 2, correct: 1, avgResponseMs: 1000, bestStreak: 1 });
    await t.db.insert(answerEvents).values({ gameId: g!.id, userId: s1.userId, playerKey: 'p0', setId, questionId: 'q1', correct: true, partial: 1, responseMs: 900 });
    const lesson = await teacher.client.post('/api/lessons', { title: 'Morning lesson' });
    expect(lesson.status).toBe(200);
    expect((await teacher.client.put(`/api/lessons/${lesson.body.id}/schedule`, { classId: cls.id, startsAt: new Date(now + 2 * 3_600_000).toISOString() })).status).toBe(200);

    const r = await teacher.client.get(`/api/making/today?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    expect(r.status).toBe(200);
    expect(r.body.dueToday).toEqual([expect.objectContaining({ title: 'Due today', className: 'Year 6 Ash', students: 2, done: 0 })]);
    expect(r.body.followUp).toEqual([expect.objectContaining({ title: 'Was due', students: 2, done: 1 })]);
    expect(r.body.lessons).toEqual([expect.objectContaining({ title: 'Morning lesson', className: 'Year 6 Ash' })]);
    // Students, other teachers and silly ranges are refused; another teacher sees none of this class.
    expect((await s1.client.get(`/api/making/today?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).status).toBe(403);
    const otherTeacher = await registered(t.app, { accountType: 'teacher' });
    const theirs = await otherTeacher.client.get(`/api/making/today?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    expect(theirs.body).toMatchObject({ dueToday: [], followUp: [], lessons: [], classes: [] });
    expect((await teacher.client.get(`/api/making/today?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(now + 9 * 86_400_000).toISOString())}`)).status).toBe(409);
  });

  it('remembers the picker and the scoreboard for the class’s teacher only', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const student = await registered(t.app, { accountType: 'student' });
    const outsider = await registered(t.app, { accountType: 'student' });
    const otherTeacher = await registered(t.app, { accountType: 'teacher' });
    const cls = (await teacher.client.post('/api/classes', { name: 'Year 4 Birch' })).body.class;
    await student.client.post('/api/classes/join', { code: cls.joinCode });
    const url = `/api/making/classes/${cls.id}/tools`;
    expect((await teacher.client.get(url)).body.state).toEqual({ picked: [], scores: [] });
    const put = await teacher.client.put(url, { picked: [student.userId, outsider.userId], scores: [{ id: 't1', label: 'Table one', points: 3 }] });
    expect(put.status).toBe(200);
    // Someone not in the class is never remembered.
    expect(put.body.state.picked).toEqual([student.userId]);
    expect((await teacher.client.get(url)).body.state.scores).toEqual([{ id: 't1', label: 'Table one', points: 3 }]);
    expect((await student.client.get(url)).status).toBe(403);
    expect((await student.client.put(url, { picked: [] })).status).toBe(403);
    expect((await otherTeacher.client.get(url)).status).toBe(404);
    expect((await otherTeacher.client.put(url, { picked: [] })).status).toBe(404);
    expect((await teacher.client.put(url, { scores: [{ id: 'bad id!', label: 'x', points: 1 }] })).status).toBe(400);
  });
  it('lists sets for the shared picker: hosted lately and starred, only while the account may still see them', async () => {
    const me = await registered(t.app, { accountType: 'teacher' });
    const author = await registered(t.app, { accountType: 'teacher' });
    const theirs = (await author.client.post('/api/sets', { title: 'Shared rivers', subject: 'geography', questions: QUESTIONS })).body.set.id as string;
    // Made public as a creator account would (teachers cannot publish to everyone themselves).
    await t.db.update(questionSets).set({ visibility: 'public' }).where(eq(questionSets.id, theirs));
    const mine = (await me.client.post('/api/sets', { title: 'My own', subject: 'science', questions: QUESTIONS })).body.set.id as string;
    expect((await me.client.patch(`/api/sets/${theirs}/organise`, { favourite: true })).status).toBe(200);
    expect((await me.client.patch(`/api/sets/${mine}/organise`, { favourite: true })).status).toBe(200);
    const starred = await me.client.get('/api/making/sets?tab=starred');
    expect(starred.status).toBe(200);
    expect(starred.body.sets.map((x: { title: string }) => x.title)).toEqual(['My own', 'Shared rivers']);
    await t.db.insert(gameSessions).values({ roomCode: '654321', modeId: 'classic', hostUserId: me.userId, setId: theirs, setTitle: 'Shared rivers', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 3, isSolo: false, startedAt: new Date(), endedAt: new Date(), durationMs: 1000 });
    const recent = await me.client.get('/api/making/sets?tab=recent');
    expect(recent.body.sets).toEqual([expect.objectContaining({ id: theirs, favourite: true })]);
    // The author makes it private: it leaves both lists.
    await t.db.update(questionSets).set({ visibility: 'private' }).where(eq(questionSets.id, theirs));
    expect((await me.client.get('/api/making/sets?tab=starred')).body.sets.map((x: { id: string }) => x.id)).toEqual([mine]);
    expect((await me.client.get('/api/making/sets?tab=recent')).body.sets).toEqual([]);
    // Someone else's stars are their own.
    expect((await author.client.get('/api/making/sets?tab=starred')).body.sets).toEqual([]);
    expect((await me.client.get('/api/making/sets?tab=everything')).status).toBe(400);
  });
});
