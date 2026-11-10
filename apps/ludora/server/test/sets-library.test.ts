import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { answerEvents, gameParticipants, gameSessions, questionSets } from '../src/db/schema.ts';
import { applyDefaults } from '../src/modules/sets/access.ts';
import { cliChangeRole } from '../src/cli/admin.ts';

/* The set library: the bin, versions, folders and favourites, share links, co-editors, statistics, the question bank and moving questions. */

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
}, 120_000);
afterAll(async () => {
  await t?.close();
});

type Account = Awaited<ReturnType<typeof registered>>;

const QUESTIONS = [
  { id: 'a', type: 'truefalse', prompt: 'Ice floats on water.', correct: true },
  { id: 'b', type: 'mcq', prompt: 'Which gas do plants take in?', choices: [{ id: 'x', text: 'Oxygen', why: 'Plants give oxygen out.' }, { id: 'y', text: 'Carbon dioxide' }], correct: 'y' },
  { id: 'c', type: 'sort', prompt: 'Sort the animals.', groups: [{ id: 'm', label: 'Mammals' }, { id: 'f', label: 'Fish' }], items: [{ id: 'd', text: 'Dog', group: 'm' }, { id: 's', text: 'Salmon', group: 'f' }, { id: 'w', text: 'Whale', group: 'm' }, { id: 'c', text: 'Cod', group: 'f' }] },
];

async function makeSet(who: Account, extra: Record<string, unknown> = {}) {
  const r = await who.client.post('/api/sets', { title: 'Science facts', subject: 'science', visibility: 'private', questions: QUESTIONS, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.set.id as string;
}

describe('the bin', () => {
  it('keeps a deleted set for 30 days, out of every list and game, until restored or removed for good', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const other = await registered(t.app, { accountType: 'teacher' });
    const id = await makeSet(teacher, { visibility: 'unlisted' });
    const del = await teacher.client.delete(`/api/sets/${id}`);
    expect(del.status).toBe(200);
    expect((await teacher.client.get(`/api/sets/${id}`)).status).toBe(404);
    expect((await other.client.get(`/api/sets/${id}`)).status).toBe(404);
    expect((await teacher.client.get('/api/sets?scope=mine')).body.sets.map((s: { id: string }) => s.id)).not.toContain(id);
    expect((await teacher.client.post('/api/rooms', { setId: id, modeId: 'classic' })).status).toBe(404);
    // Nobody else can see, restore or empty someone's bin.
    expect((await other.client.get('/api/sets/bin')).body.sets).toEqual([]);
    expect((await other.client.post(`/api/sets/${id}/restore`)).status).toBe(404);
    expect((await other.client.delete(`/api/sets/${id}/forever`)).status).toBe(404);
    const bin = await teacher.client.get('/api/sets/bin');
    expect(bin.body.sets).toHaveLength(1);
    expect(bin.body.sets[0]).toMatchObject({ id, title: 'Science facts', questionCount: 3 });
    expect(new Date(bin.body.sets[0].removeAt).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect((await teacher.client.post(`/api/sets/${id}/restore`)).status).toBe(200);
    expect((await teacher.client.get(`/api/sets/${id}`)).status).toBe(200);
    // After 30 days in the bin a set is gone for good.
    await teacher.client.delete(`/api/sets/${id}`);
    await t.db.update(questionSets).set({ deletedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(questionSets.id, id));
    expect((await teacher.client.get('/api/sets/bin')).body.sets).toEqual([]);
    expect(await t.db.select().from(questionSets).where(eq(questionSets.id, id))).toEqual([]);
    // Or straight away, on request.
    const id2 = await makeSet(teacher);
    await teacher.client.delete(`/api/sets/${id2}`);
    expect((await teacher.client.delete(`/api/sets/${id2}/forever`)).status).toBe(200);
    expect((await teacher.client.get('/api/sets/bin')).body.sets).toEqual([]);
  });
});

describe('version history', () => {
  it('keeps each save (the last 20), shows one and restores it, for the owner and co-editors only', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const stranger = await registered(t.app, { accountType: 'teacher' });
    const id = await makeSet(teacher);
    const base = { title: 'Science facts', subject: 'science', visibility: 'private' };
    for (let i = 1; i <= 22; i++) {
      const r = await teacher.client.put(`/api/sets/${id}`, { ...base, title: `Version ${i}`, questions: QUESTIONS.slice(0, (i % 3) + 1) });
      expect(r.status).toBe(200);
    }
    const list = await teacher.client.get(`/api/sets/${id}/versions`);
    expect(list.body.versions).toHaveLength(20);
    expect(list.body.versions[0]).toMatchObject({ title: 'Version 21' });
    const old = list.body.versions.find((v: { title: string }) => v.title === 'Version 5');
    const one = await teacher.client.get(`/api/sets/${id}/versions/${old.id}`);
    expect(one.body.version.questions.map((q: { id: string }) => q.id)).toEqual(['a', 'b', 'c']);
    expect((await stranger.client.get(`/api/sets/${id}/versions`)).status).toBe(404);
    expect((await stranger.client.post(`/api/sets/${id}/versions/${old.id}/restore`)).status).toBe(404);
    expect((await teacher.client.post(`/api/sets/${id}/versions/${old.id}/restore`)).status).toBe(200);
    const now = await teacher.client.get(`/api/sets/${id}`);
    expect(now.body.set.title).toBe('Version 5');
    expect(now.body.questions).toHaveLength(3);
    // The set as it was before the restore is the newest version, so the restore can be undone.
    expect((await teacher.client.get(`/api/sets/${id}/versions`)).body.versions[0].title).toBe('Version 22');
  });
});

describe('folders, favourites, tags, filters and sorting', () => {
  it('files my sets, stars any set and filters the library by year level and topic', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const other = await registered(t.app, { accountType: 'teacher' });
    const a = await makeSet(teacher, { title: 'Apples', tags: ['plants'], gradeBand: 'Year 5', topic: 'Habitats' });
    const b = await makeSet(teacher, { title: 'Bees', tags: ['animals'] });
    expect((await teacher.client.patch(`/api/sets/${a}/organise`, { folder: '  Term 1  ' })).status).toBe(200);
    expect((await teacher.client.patch(`/api/sets/${b}/organise`, { favourite: true })).status).toBe(200);
    const inFolder = await teacher.client.get('/api/sets?scope=mine&folder=Term%201');
    expect(inFolder.body.sets.map((s: { id: string }) => s.id)).toEqual([a]);
    expect(inFolder.body.sets[0].folder).toBe('Term 1');
    expect((await teacher.client.get('/api/sets?scope=mine&folder=-')).body.sets.map((s: { id: string }) => s.id)).toEqual([b]);
    expect((await teacher.client.get('/api/sets?scope=mine&favourites=1')).body.sets.map((s: { id: string; favourite: boolean }) => [s.id, s.favourite])).toEqual([[b, true]]);
    expect((await teacher.client.get('/api/sets?scope=mine&tag=plants')).body.sets.map((s: { id: string }) => s.id)).toEqual([a]);
    expect((await teacher.client.get('/api/sets?scope=mine&sort=title')).body.sets.map((s: { title: string }) => s.title)).toEqual(['Apples', 'Bees']);
    expect((await teacher.client.get('/api/sets?scope=mine&year=Year%205&topic=habitats')).body.sets.map((s: { id: string }) => s.id)).toEqual([a]);
    const org = await teacher.client.get('/api/sets/organise');
    expect(org.body).toMatchObject({ folders: [{ name: 'Term 1', count: 1 }], favourites: 1 });
    expect(org.body.tags.map((x: { name: string }) => x.name)).toEqual(['animals', 'plants']);
    // Someone else cannot file my set, and a private set is not theirs to star.
    expect((await other.client.patch(`/api/sets/${a}/organise`, { folder: 'Mine now' })).status).toBe(404);
    expect((await other.client.patch(`/api/sets/${a}/organise`, { favourite: true })).status).toBe(404);
  });
});

describe('sharing', () => {
  it('a private link lets another teacher see the whole set and copy it, until it is turned off', async () => {
    const owner = await registered(t.app, { accountType: 'teacher' });
    const colleague = await registered(t.app, { accountType: 'teacher' });
    const id = await makeSet(owner);
    expect((await colleague.client.post(`/api/sets/${id}/share-link`)).status).toBe(404);
    const link = await owner.client.post(`/api/sets/${id}/share-link`);
    const token = link.body.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const seen = await colleague.client.get(`/api/sets/shared/${token}`);
    expect(seen.status).toBe(200);
    expect(seen.body.questions).toHaveLength(3);
    expect(JSON.stringify(seen.body)).not.toContain(owner.userId);
    // The link does not open the set itself for editing or anywhere else.
    expect((await colleague.client.get(`/api/sets/${id}`)).status).toBe(404);
    const copy = await colleague.client.post(`/api/sets/shared/${token}/copy`);
    expect(copy.status).toBe(200);
    expect((await colleague.client.get(`/api/sets/${copy.body.set.id}`)).body).toMatchObject({ editable: true, owner: true });
    expect((await owner.client.delete(`/api/sets/${id}/share-link`)).status).toBe(200);
    expect((await colleague.client.get(`/api/sets/shared/${token}`)).status).toBe(404);
  });

  it('co-editors chosen by username can edit and host, but not publish, share, delete or add others', async () => {
    const owner = await registered(t.app, { accountType: 'teacher' });
    const coeditor = await registered(t.app, { accountType: 'teacher' });
    const student = await registered(t.app, { accountType: 'student' });
    const stranger = await registered(t.app, { accountType: 'teacher' });
    const id = await makeSet(owner);
    // A student account cannot be added, and the answer does not say whether the name exists.
    const bad = await owner.client.post(`/api/sets/${id}/editors`, { username: student.username });
    expect(bad.status).toBe(404);
    expect((await owner.client.post(`/api/sets/${id}/editors`, { username: 'nobody-by-this-name' })).body.error.message).toBe(bad.body.error.message);
    expect((await stranger.client.post(`/api/sets/${id}/editors`, { username: coeditor.username })).status).toBe(404);
    const add = await owner.client.post(`/api/sets/${id}/editors`, { username: coeditor.username.toUpperCase() });
    expect(add.status).toBe(200);
    expect((await owner.client.get(`/api/sets/${id}/editors`)).body.editors.map((e: { userId: string }) => e.userId)).toEqual([coeditor.userId]);
    const view = await coeditor.client.get(`/api/sets/${id}`);
    expect(view.body).toMatchObject({ editable: true, owner: false });
    expect(view.body.set).not.toHaveProperty('shareToken');
    expect((await coeditor.client.get('/api/sets?scope=shared')).body.sets.map((s: { id: string }) => s.id)).toEqual([id]);
    const save = await coeditor.client.put(`/api/sets/${id}`, { title: 'Edited together', subject: 'science', visibility: 'unlisted', questions: QUESTIONS });
    expect(save.status).toBe(200);
    expect(save.body.set).toMatchObject({ title: 'Edited together', visibility: 'private' });
    expect((await coeditor.client.post('/api/rooms', { setId: id, modeId: 'classic' })).status).toBe(200);
    expect((await coeditor.client.delete(`/api/sets/${id}`)).status).toBe(404);
    expect((await coeditor.client.post(`/api/sets/${id}/share-link`)).status).toBe(404);
    expect((await coeditor.client.get(`/api/sets/${id}/editors`)).status).toBe(404);
    expect((await stranger.client.put(`/api/sets/${id}`, { title: 'Hijack', subject: 'science', visibility: 'private', questions: QUESTIONS })).status).toBe(404);
    // Removed, the co-editor loses access.
    expect((await owner.client.delete(`/api/sets/${id}/editors/${coeditor.userId}`)).status).toBe(200);
    expect((await coeditor.client.get(`/api/sets/${id}`)).status).toBe(404);
    expect((await coeditor.client.put(`/api/sets/${id}`, { title: 'Too late', subject: 'science', visibility: 'private', questions: QUESTIONS })).status).toBe(404);
  });
});

describe('statistics, the question bank and moving questions', () => {
  it('counts games and answers from real games and names the hardest questions, for editors only', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const player = await registered(t.app);
    const id = await makeSet(teacher, { visibility: 'unlisted' });
    const [g] = await t.db.insert(gameSessions).values({ roomCode: '123456', modeId: 'classic', hostUserId: teacher.userId, setId: id, setTitle: 'Science facts', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, startedAt: new Date(Date.now() - 60_000), endedAt: new Date(), durationMs: 60_000 }).returning();
    await t.db.insert(gameParticipants).values({ gameId: g!.id, userId: player.userId, playerKey: 'p0', displayName: 'P', isGuest: false, isBot: false, rank: 1, score: 100, label: '', answered: 3, correct: 1, avgResponseMs: 2000, bestStreak: 1 });
    const ans = (questionId: string, correct: boolean, partial = correct ? 1 : 0) => ({ gameId: g!.id, userId: player.userId, playerKey: 'p0', setId: id, questionId, correct, partial, responseMs: 1500 });
    await t.db.insert(answerEvents).values([ans('a', true), ans('a', true), ans('a', true), ans('b', false), ans('b', false), ans('b', true), ans('c', false, 0.5), ans('c', false, 0.5), ans('c', true)]);
    const stats = await teacher.client.get(`/api/sets/${id}/stats`);
    expect(stats.body).toMatchObject({ games: 1, answers: 9 });
    expect(stats.body.accuracy).toBeCloseTo((3 + 1 + 2) / 9, 5);
    expect(stats.body.hardest.map((h: { questionId: string }) => h.questionId)).toEqual(['b', 'c', 'a']);
    expect(stats.body.hardest[0]).toMatchObject({ number: 2, prompt: 'Which gas do plants take in?' });
    expect((await player.client.get(`/api/sets/${id}/stats`)).status).toBe(403);
  });

  it('finds my own questions across my sets, and copies or moves them into another of my sets', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const other = await registered(t.app, { accountType: 'teacher' });
    const a = await makeSet(teacher, { title: 'Plants' });
    const b = await makeSet(teacher, { title: 'Space', questions: [{ id: 'a', type: 'truefalse', prompt: 'The Moon is a star.', correct: false }] });
    await makeSet(other, { title: 'Not mine', questions: [{ id: 'z', type: 'truefalse', prompt: 'Plants take in gas.', correct: true }] });
    const found = await teacher.client.get('/api/sets/bank?q=plants%20gas');
    expect(found.body.results.map((r: { setTitle: string; question: { id: string } }) => [r.setTitle, r.question.id])).toEqual([['Plants', 'b']]);
    expect((await teacher.client.get(`/api/sets/bank?q=moon&exclude=${b}`)).body.results).toEqual([]);
    const copy = await teacher.client.post(`/api/sets/${a}/questions/transfer`, { to: b, questionIds: ['a', 'c'], mode: 'copy' });
    expect(copy.body).toMatchObject({ ok: true, count: 2 });
    const space = await teacher.client.get(`/api/sets/${b}`);
    expect(space.body.questions.map((q: { prompt: string }) => q.prompt)).toEqual(['The Moon is a star.', 'Ice floats on water.', 'Sort the animals.']);
    expect(new Set(space.body.questions.map((q: { id: string }) => q.id)).size).toBe(3);
    await teacher.client.post(`/api/sets/${a}/questions/transfer`, { to: b, questionIds: ['b'], mode: 'move' });
    expect((await teacher.client.get(`/api/sets/${a}`)).body.questions.map((q: { id: string }) => q.id)).toEqual(['a', 'c']);
    expect((await teacher.client.post(`/api/sets/${a}/questions/transfer`, { to: b, questionIds: ['a', 'c'], mode: 'move' })).status).toBe(400);
    // Not into a set someone else owns.
    const theirs = (await other.client.get('/api/sets?scope=mine')).body.sets[0].id;
    expect((await teacher.client.post(`/api/sets/${a}/questions/transfer`, { to: theirs, questionIds: ['a'], mode: 'copy' })).status).toBe(404);
  });
});

describe('set rules', () => {
  it('needs every picture described before a set goes to the public library', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    expect((await cliChangeRole(t.db, 'test', 'grant', teacher.username, 'trusted', 'test setup')).ok).toBe(true);
    const picture = { kind: 'image', url: '/art/cat.png', alt: '' };
    const r = await teacher.client.post('/api/sets', { title: 'Pictures', subject: 'science', visibility: 'public', questions: [{ id: 'p', type: 'truefalse', prompt: 'Is this a cat?', correct: true, media: picture }] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/Question 1 has a picture with no description/);
    expect(r.body.error.fields).toEqual({ 'questions.0.media': 'Describe this picture for players who cannot see it.' });
  });

  it('asks a random number of the questions and shuffles the answers when the set asks for it', () => {
    const qs = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, type: 'mcq' as const, prompt: `Q${i}`, choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], correct: 'a' }));
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = applyDefaults(qs, { randomCount: 4, shuffleAnswers: true }, random);
    expect(out).toHaveLength(4);
    // Still in set order, and every question keeps its right answer.
    expect(out.map((q) => Number(q.id.slice(1)))).toEqual([...out.map((q) => Number(q.id.slice(1)))].sort((x, y) => x - y));
    expect(out.every((q) => q.type === 'mcq' && q.correct === 'a' && q.choices.length === 3)).toBe(true);
    expect(out.some((q) => q.type === 'mcq' && q.choices[0]!.id !== 'a')).toBe(true);
    expect(applyDefaults(qs, null)).toBe(qs);
  });
});
