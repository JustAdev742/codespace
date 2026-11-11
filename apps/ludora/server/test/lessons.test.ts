import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { lessonRuns, lessons, notifications, questionSets } from '../src/db/schema.ts';
import type { Room } from '../src/realtime/room.ts';
import { lessonSavesIdle } from '../src/modules/lessons/routes.ts';

/*
 * Lessons: every route against the owner, another teacher (404, as if the lesson did not exist)
 * and a student (403); a two-game lesson with a slide run in one room by two players, with lesson
 * standings, a report linking each game, and carrying on another day; the plan note never in a
 * room view; sharing by username; scheduling that opens nothing by itself.
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
];
const NOTE = 'Ask Sam about last week first';

let teacher: Account;
let other: Account;
let student: Account;
let classId: string;
let setId: string;
let privateSetId: string;

beforeAll(async () => {
  teacher = await registered(t.app, { accountType: 'teacher' });
  other = await registered(t.app, { accountType: 'teacher' });
  student = await registered(t.app, { accountType: 'student' });
  const made = await teacher.client.post('/api/classes', { name: 'Year 5 Oak' });
  classId = made.body.class.id;
  await student.client.post('/api/classes/join', { code: made.body.class.joinCode });
  const [set] = await t.db.insert(questionSets).values({ ownerId: teacher.userId, title: 'Animals', subject: 'general', visibility: 'private', questions: QUESTIONS, questionCount: 3 }).returning({ id: questionSets.id });
  setId = set!.id;
  const [priv] = await t.db.insert(questionSets).values({ ownerId: other.userId, title: 'Secret', subject: 'general', visibility: 'private', questions: QUESTIONS, questionCount: 3 }).returning({ id: questionSets.id });
  privateSetId = priv!.id;
});

const room = (code: string) => t.deps.rooms.get(code) as Room;
const game = (title = '') => ({ id: 'g1', kind: 'game', title, setId, modeId: 'classic', variantId: null, settings: {}, common: { questionLimit: 3 }, note: NOTE });

function lessonBody(): { title: string; goals: string[]; standings: boolean; steps: Record<string, unknown>[] } {
  return {
    title: 'Animals lesson',
    goals: ['name three mammals'],
    standings: true,
    steps: [
      { id: 'a1', kind: 'slide', title: 'Welcome', lines: ['Today: animals'], image: null, note: NOTE },
      { ...game('Starter'), id: 'a2' },
      { id: 'a3', kind: 'discussion', prompt: 'Which animal is your favourite?', seconds: 60, note: NOTE },
      { ...game('Exit ticket'), id: 'a4' },
    ],
  };
}

/** Play a room's classic game: each listed player answers every question right or wrong, then it ends. */
async function play(r: Room, players: { id: string; right: boolean }[]) {
  expect(r.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
  for (let i = 0; i < 5; i++) {
    const state = r.runtime!.debugState() as { sync: { phase: string; iid: string } };
    if (state.sync.phase !== 'question') r.hostCommand({ cmd: 'next' });
    const s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
    if (s.phase !== 'question') break;
    const reveal = r.runtime!.debugReveal(s.iid) as { correct: boolean };
    for (const p of players) r.action(p.id, `a-${p.id}-${i}-${r.gameId!.slice(0, 6)}`, { type: 'answer', iid: s.iid, answer: { type: 'truefalse', value: p.right ? reveal.correct : !reveal.correct } });
    r.hostCommand({ cmd: 'next' });
  }
  if (r.status !== 'ended') r.hostCommand({ cmd: 'end' });
  await t.deps.rooms.idle();
  await lessonSavesIdle();
}

async function newLesson(body: object = lessonBody()) {
  const made = await teacher.client.post('/api/lessons', {});
  expect(made.status).toBe(200);
  const saved = await teacher.client.put(`/api/lessons/${made.body.id}`, body);
  expect(saved.status).toBe(200);
  return made.body.id as string;
}

describe('lessons belong to their teacher', () => {
  it('every route refuses another teacher with a 404 and a student with a 403', async () => {
    const id = await newLesson();
    const routes: [string, string, unknown?][] = [
      ['GET', `/api/lessons/${id}`],
      ['PUT', `/api/lessons/${id}`, lessonBody()],
      ['POST', `/api/lessons/${id}/duplicate`, {}],
      ['POST', `/api/lessons/${id}/steps`, game()],
      ['POST', `/api/lessons/${id}/share`, { username: teacher.username }],
      ['PUT', `/api/lessons/${id}/schedule`, { classId: null, startsAt: null }],
      ['POST', `/api/lessons/${id}/run`, {}],
      ['GET', `/api/lessons/${id}/runs`],
      ['DELETE', `/api/lessons/${id}`],
    ];
    for (const [method, url, body] of routes) {
      expect((await other.client.request(method as 'GET', url, body)).status, `${method} ${url} by another teacher`).toBe(404);
      expect((await student.client.request(method as 'GET', url, body)).status, `${method} ${url} by a student`).toBe(403);
    }
    expect((await student.client.get('/api/lessons')).status).toBe(403);
    expect((await student.client.post('/api/lessons', {})).status).toBe(403);
    // The other teacher's own list does not show it, and the lesson is untouched.
    expect((await other.client.get('/api/lessons')).body.lessons).toEqual([]);
    const mine = await teacher.client.get(`/api/lessons/${id}`);
    expect(mine.body.lesson.steps).toHaveLength(4);
    expect(mine.body.lesson.title).toBe('Animals lesson');
  });

  it('a lesson report and the next step are refused to anyone but the host', async () => {
    const id = await newLesson();
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    expect(run.status).toBe(200);
    expect((await other.client.get(`/api/lessons/runs/${run.body.runId}`)).status).toBe(404);
    expect((await student.client.get(`/api/lessons/runs/${run.body.runId}`)).status).toBe(403);
    expect((await other.client.post(`/api/lessons/rooms/${run.body.code}/next`, {})).status).toBe(404);
    expect((await student.client.post(`/api/lessons/rooms/${run.body.code}/next`, {})).status).toBe(403);
    expect(room(run.body.code).lesson).toBeTruthy();
    room(run.body.code).close('done');
  });
});

describe('making lessons', () => {
  it('creates, renames, reorders, duplicates and deletes, with an estimated length', async () => {
    const id = await newLesson();
    const got = await teacher.client.get(`/api/lessons/${id}`);
    // Slide 2 + starter (3 questions, host-paced) + discussion 2 + exit ticket.
    expect(got.body.info.map((s: { minutes: number }) => s.minutes)).toEqual([2, 2, 2, 2]);
    expect(got.body.totalMinutes).toBe(8);
    expect(got.body.info[1].title).toBe('Starter');
    const body = lessonBody();
    body.title = 'Renamed';
    body.steps.reverse();
    const saved = await teacher.client.put(`/api/lessons/${id}`, body);
    expect(saved.body.lesson.title).toBe('Renamed');
    expect(saved.body.lesson.steps.map((s: { id: string }) => s.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    const copy = await teacher.client.post(`/api/lessons/${id}/duplicate`, {});
    expect((await teacher.client.get(`/api/lessons/${copy.body.id}`)).body.lesson.title).toBe('Renamed (copy)');
    expect((await teacher.client.delete(`/api/lessons/${copy.body.id}`)).status).toBe(200);
    expect((await teacher.client.get(`/api/lessons/${copy.body.id}`)).status).toBe(404);
  });

  it('starts from a template, and adds a step from anywhere', async () => {
    const templates = await teacher.client.get('/api/lessons/templates');
    expect(templates.body.templates.map((x: { id: string }) => x.id)).toEqual(['starter-main-exit', 'revision-carousel', 'friday-quiz']);
    const made = await teacher.client.post('/api/lessons', { template: 'friday-quiz' });
    const got = await teacher.client.get(`/api/lessons/${made.body.id}`);
    expect(got.body.lesson.standings).toBe(true);
    expect(got.body.info[1].problem).toBe('Choose a question set.');
    // A template cannot run until its games have sets.
    expect((await teacher.client.post(`/api/lessons/${made.body.id}/run`, {})).body.error.message).toBe('Step 2 needs a question set.');
    const added = await teacher.client.post(`/api/lessons/${made.body.id}/steps`, { id: 'x', kind: 'game', setId, modeId: 'gold-rush', variantId: null });
    expect(added.body.steps).toBe(6);
    // A new lesson straight from a set's page.
    const fromSet = await teacher.client.post('/api/lessons', { title: 'From a set', step: { id: 'x', kind: 'game', setId, modeId: 'classic' } });
    expect((await teacher.client.get(`/api/lessons/${fromSet.body.id}`)).body.info[0].title).toBe('Classic: Animals');
  });

  it('puts slide text, goals and titles through the language filter, and refuses modes played alone', async () => {
    const id = await newLesson();
    const rude = lessonBody();
    rude.steps[0] = { ...rude.steps[0]!, lines: ['you are a shithead'] } as (typeof rude.steps)[number];
    const r = await teacher.client.put(`/api/lessons/${id}`, rude);
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe('Step 1 has a word players cannot see. Try different words.');
    const goal = { ...lessonBody(), goals: ['shithead'] };
    expect((await teacher.client.put(`/api/lessons/${id}`, goal)).status).toBe(400);
    const solo = { ...lessonBody(), steps: [{ ...game(), modeId: 'time-attack' }] };
    expect((await teacher.client.put(`/api/lessons/${id}`, solo)).body.error.message).toMatch(/played alone/);
    // A private plan note is the teacher's own and is not filtered.
    const noted = lessonBody();
    noted.steps[0] = { ...noted.steps[0]!, note: 'shithead behaviour last week' } as (typeof noted.steps)[number];
    expect((await teacher.client.put(`/api/lessons/${id}`, noted)).status).toBe(200);
  });

  it('flags a set the teacher cannot play, and refuses to run it', async () => {
    const id = await newLesson({ ...lessonBody(), steps: [{ ...game(), setId: privateSetId }] });
    const got = await teacher.client.get(`/api/lessons/${id}`);
    expect(got.body.info[0].problem).toMatch(/private to its owner/);
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    expect(run.status).toBe(403);
    expect(run.body.error.message).toBe('Step 1: That question set is private.');
  });
});

describe('sharing a lesson by username', () => {
  it('gives the other teacher a copy without your notes, and reveals nothing else', async () => {
    const id = await newLesson();
    const unknown = await teacher.client.post(`/api/lessons/${id}/share`, { username: 'nobody-here-zz' });
    const studentName = await teacher.client.post(`/api/lessons/${id}/share`, { username: student.username });
    expect(unknown.status).toBe(404);
    expect(studentName.status).toBe(404);
    expect(studentName.body).toEqual(unknown.body);
    expect(unknown.body.error.message).toBe('No teacher with that username.');
    const shared = await teacher.client.post(`/api/lessons/${id}/share`, { username: other.username.toUpperCase() });
    expect(shared.status).toBe(200);
    expect(JSON.stringify(shared.body)).not.toContain(other.userId);
    const theirs = await other.client.get('/api/lessons');
    expect(theirs.body.lessons).toHaveLength(1);
    const copy = await other.client.get(`/api/lessons/${theirs.body.lessons[0].id}`);
    expect(copy.body.lesson.title).toBe('Animals lesson');
    expect(JSON.stringify(copy.body)).not.toContain(NOTE);
    // A copy, not access: the original is still refused to them, and their edits stay theirs.
    expect((await other.client.get(`/api/lessons/${id}`)).status).toBe(404);
    const [n] = await t.db.select().from(notifications).where(eq(notifications.userId, other.userId));
    expect(n?.title).toContain('shared a lesson with you');
    await other.client.delete(`/api/lessons/${theirs.body.lessons[0].id}`);
  });
});

describe('scheduling', () => {
  it('shows on the class page and opens nothing by itself; Join appears once the teacher opens the room', async () => {
    const id = await newLesson();
    const at = new Date(Date.now() + 30 * 60_000).toISOString();
    expect((await other.client.put(`/api/lessons/${id}/schedule`, { classId, startsAt: at })).status).toBe(404);
    // Another teacher's class cannot be used.
    const theirClass = await other.client.post('/api/classes', { name: 'Not yours' });
    expect((await teacher.client.put(`/api/lessons/${id}/schedule`, { classId: theirClass.body.class.id, startsAt: at })).status).toBe(404);
    const roomsBefore = t.deps.rooms.list().filter((r) => !r.isClosed()).length;
    expect((await teacher.client.put(`/api/lessons/${id}/schedule`, { classId, startsAt: at })).status).toBe(200);
    expect(t.deps.rooms.list().filter((r) => !r.isClosed()).length).toBe(roomsBefore);
    const seen = await student.client.get(`/api/lessons/class/${classId}`);
    expect(seen.status).toBe(200);
    expect(seen.body.lessons).toEqual([{ title: 'Animals lesson', startsAt: at.replace(/\.\d+Z$/, (m) => m), roomCode: null }]);
    expect(JSON.stringify(seen.body)).not.toContain(NOTE);
    expect((await other.client.get(`/api/lessons/class/${classId}`)).status).toBe(404);
    // The teacher opens it: a class game, with a Join code for the class.
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    expect(room(run.body.code).classId).toBe(classId);
    const after = await student.client.get(`/api/lessons/class/${classId}`);
    expect(after.body.lessons[0].roomCode).toBe(run.body.code);
    expect(room(run.body.code).status).toBe('lobby');
    room(run.body.code).close('done');
    expect((await teacher.client.put(`/api/lessons/${id}/schedule`, { classId: null, startsAt: null })).status).toBe(200);
  });
});

describe('running a lesson in one room', () => {
  it('carries the same players through a slide, two games and a discussion, with lesson standings and a report', async () => {
    const id = await newLesson();
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    const r = room(run.body.code);
    const ada = r.join({ name: 'Ada', userId: student.userId, accountName: 'Ada', isGuestAccount: false, avatar: null });
    const bo = r.join({ name: 'Bo', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!ada.ok || !bo.ok) throw new Error('join failed');
    // Step 1, a slide: on every screen, and there is no game to start yet.
    let view = r.view(ada.player.id);
    expect(view.lesson?.screen).toEqual({ kind: 'slide', title: 'Welcome', lines: ['Today: animals'], image: null });
    expect(view.lesson?.goals).toEqual(['name three mammals']);
    expect(r.hostCommand({ cmd: 'start', now: true }).ok).toBe(false);
    // The teacher's plan note is in no view: not the players', the host's or the remote's.
    for (const v of [r.view(ada.player.id), r.view(bo.player.id), r.view(null), r.view(null, true)]) expect(JSON.stringify(v)).not.toContain(NOTE);
    expect(view.lesson).not.toHaveProperty('lessonId');
    expect(r.view(null).lesson?.lessonId).toBe(id);

    const next = () => teacher.client.post(`/api/lessons/rooms/${run.body.code}/next`, {});
    expect((await next()).body.index).toBe(1);
    expect(r.status).toBe('lobby');
    expect(r.view(null).lesson?.screen).toBeNull();
    await play(r, [
      { id: ada.player.id, right: true },
      { id: bo.player.id, right: false },
    ]);
    expect(r.status).toBe('ended');
    // Ada: 3 right (30) and first place (30); Bo: second place (20).
    expect(r.view(ada.player.id).lesson?.standings).toEqual([
      { name: 'Ada', points: 60, rank: 1, mine: true },
      { name: 'Bo', points: 20, rank: 2 },
    ]);
    // Next while a game runs is refused.
    expect((await next()).body.index).toBe(2);
    view = r.view(bo.player.id);
    expect(view.lesson?.screen?.kind).toBe('discussion');
    // The same players, without rejoining.
    expect(view.players.map((p) => p.name)).toEqual(['Ada', 'Bo']);
    expect((await next()).body.index).toBe(3);
    expect(r.set.title).toBe('Animals');
    await play(r, [
      { id: ada.player.id, right: false },
      { id: bo.player.id, right: true },
    ]);
    expect(r.view(null).lesson?.standings?.map((s) => [s.name, s.points])).toEqual([
      ['Ada', 80],
      ['Bo', 80],
    ]);
    expect(r.view(null).lesson?.standings?.map((s) => s.rank)).toEqual([1, 1]);
    const done = await next();
    expect(done.body.finished).toBe(true);
    expect(r.view(ada.player.id).lesson?.screen).toEqual({ kind: 'end' });
    await lessonSavesIdle();

    const report = await teacher.client.get(`/api/lessons/runs/${run.body.runId}`);
    expect(report.status).toBe(200);
    expect(report.body.games.map((g: { title: string }) => g.title)).toEqual(['Starter', 'Exit ticket']);
    for (const g of report.body.games) expect((await teacher.client.get(`/api/games/${g.gameId}/report`)).status).toBe(200);
    expect(report.body.run.finishedAt).not.toBeNull();
    expect(report.body.standings.map((s: { name: string; points: number }) => [s.name, s.points])).toEqual([
      ['Ada', 80],
      ['Bo', 80],
    ]);
    // Three questions are too few for Time Attack, so homework from it is flashcards.
    expect(report.body.sets).toEqual([{ id: setId, title: 'Animals', modeId: 'flashcard-study' }]);
    // No account ids anywhere in what the report sends.
    expect(JSON.stringify(report.body)).not.toContain(student.userId);
    r.close('done');
  });

  it('remembers the step and the standings, and carries on next time', async () => {
    const id = await newLesson();
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    let r = room(run.body.code);
    const ada = r.join({ name: 'Ada', userId: student.userId, accountName: 'Ada', isGuestAccount: false, avatar: null });
    if (!ada.ok) throw new Error('join failed');
    await teacher.client.post(`/api/lessons/rooms/${run.body.code}/next`, {});
    await play(r, [{ id: ada.player.id, right: true }]);
    r.close('The bell went.');
    await lessonSavesIdle();
    const [saved] = await t.db.select().from(lessonRuns).where(eq(lessonRuns.id, run.body.runId));
    expect(saved?.stepIndex).toBe(1);
    const got = await teacher.client.get(`/api/lessons/${id}`);
    expect(got.body.lastRun).toMatchObject({ index: 1, finished: false, games: 1 });

    const again = await teacher.client.post(`/api/lessons/${id}/run`, { carryOn: true });
    expect(again.body.runId).toBe(run.body.runId);
    r = room(again.body.code);
    // The game at step 2 was played, so the class carries on at the discussion, with its points.
    expect(r.view(null).lesson?.index).toBe(2);
    expect(r.view(null).lesson?.screen?.kind).toBe('discussion');
    const back = r.join({ name: 'Ada', userId: student.userId, accountName: 'Ada', isGuestAccount: false, avatar: null });
    if (!back.ok) throw new Error('join failed');
    // One player alone: 3 right, no places.
    expect(r.view(back.player.id).lesson?.standings).toEqual([{ name: 'Ada', points: 30, rank: 1, mine: true }]);
    r.close('done');
  });

  it('shows an info slide picture and its description on every screen, and refuses pictures from elsewhere', async () => {
    const body = lessonBody();
    body.steps[0] = { ...body.steps[0]!, image: { kind: 'image', url: '/uploads/abc123.png', alt: 'The Moon over a hill' } } as (typeof body.steps)[number];
    const id = await newLesson(body);
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    const r = room(run.body.code);
    const p = r.join({ name: 'Cy', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!p.ok) throw new Error('join failed');
    expect(r.view(p.player.id).lesson?.screen).toMatchObject({ kind: 'slide', image: { url: '/uploads/abc123.png', alt: 'The Moon over a hill' } });
    r.close('done');
    const outside = lessonBody();
    outside.steps[0] = { ...outside.steps[0]!, image: { kind: 'image', url: 'https://example.com/x.png', alt: 'x' } } as (typeof outside.steps)[number];
    expect((await teacher.client.put(`/api/lessons/${id}`, outside)).status).toBe(400);
  });

  it('with standings off, each game stands alone', async () => {
    const id = await newLesson({ ...lessonBody(), standings: false });
    const run = await teacher.client.post(`/api/lessons/${id}/run`, {});
    expect(room(run.body.code).view(null).lesson?.standings).toBeNull();
    room(run.body.code).close('done');
  });

  it('deleting a lesson deletes its runs', async () => {
    const id = await newLesson();
    await teacher.client.post(`/api/lessons/${id}/run`, {}).then((x) => room(x.body.code).close('done'));
    await teacher.client.delete(`/api/lessons/${id}`);
    expect(await t.db.select().from(lessonRuns).where(eq(lessonRuns.lessonId, id))).toEqual([]);
    expect(await t.db.select().from(lessons).where(eq(lessons.id, id))).toEqual([]);
  });
});
