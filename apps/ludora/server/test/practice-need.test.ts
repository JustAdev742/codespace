import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { answerEvents, gameParticipants, gameSessions, questionSets } from '../src/db/schema.ts';
import { needOrder } from '../src/modules/study/logic.ts';

/*
 * Practice that starts with what a player needs most (modules/study: `needOrder`, `questionsByNeed`;
 * rooms: `order: 'need'`). The order first, then a solo room made with it, and a game with other
 * people, which never takes it.
 */

const at = (day: number) => new Date(Date.UTC(2026, 10, day, 9));
const qs = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => ({ id }));

describe('the order a player needs', () => {
  it('what they last got wrong first (the latest miss first), then what they have not met, then what they know, the oldest first', () => {
    const latest = new Map([
      ['q1', { correct: true, at: at(2) }],
      ['q2', { correct: false, at: at(9) }],
      ['q3', { correct: true, at: at(8) }],
      ['q4', { correct: false, at: at(5) }],
    ]);
    expect(needOrder(qs, latest).map((q) => q.id)).toEqual(['q2', 'q4', 'q5', 'q1', 'q3']);
  });

  it('leaves a set nobody has played in its own order, and never drops a question', () => {
    expect(needOrder(qs, new Map()).map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(needOrder(qs, new Map([['gone', { correct: false, at: at(1) }]]))).toHaveLength(5);
  });
});

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id, i) => ({ id, type: 'truefalse', prompt: `Fact number ${i + 1} is true.`, correct: true }));

async function played(userId: string, setId: string, endedAt: Date, answers: [string, boolean, string?][]) {
  const [g] = await t.db
    .insert(gameSessions)
    .values({ roomCode: '123456', modeId: 'classic', hostUserId: userId, setId, setTitle: 'Facts', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, isSolo: true, startedAt: new Date(endedAt.getTime() - 60_000), endedAt, durationMs: 60_000 })
    .returning();
  await t.db.insert(gameParticipants).values({ gameId: g!.id, userId, playerKey: 'p0', displayName: 'Player', isGuest: false, isBot: false, rank: 1, score: 0, label: '', answered: answers.length, correct: answers.filter(([, c]) => c).length, avgResponseMs: 2000, bestStreak: 1 });
  await t.db.insert(answerEvents).values(answers.map(([questionId, correct, kind]) => ({ gameId: g!.id, userId, playerKey: 'p0', setId, questionId, correct, partial: correct ? 1 : 0, responseMs: 1500, kind: kind ?? 'answer', createdAt: endedAt })));
}

describe('a solo room made in that order', () => {
  it("starts with the player's own misses, keeps the order, and is theirs alone", async () => {
    const ana = await registered(t.app, { accountType: 'student' });
    const ben = await registered(t.app, { accountType: 'student' });
    const [made] = await t.db.insert(questionSets).values({ ownerId: ana.userId, title: 'Facts', subject: 'science', visibility: 'public', questions: QUESTIONS, questionCount: QUESTIONS.length }).returning({ id: questionSets.id });
    const setId = made!.id;
    // Ana: q1 right long ago; then q2 and q4 wrong, q3 right; then q4 wrong again more recently than q2. A self-marked card says nothing.
    await played(ana.userId, setId, at(2), [['q1', true]]);
    await played(ana.userId, setId, at(5), [['q2', false], ['q3', true], ['q4', false], ['q5', true, 'self']]);
    await played(ana.userId, setId, at(8), [['q4', false]]);
    // Ben has only ever got q5 wrong.
    await played(ben.userId, setId, at(6), [['q5', false]]);

    const mine = await ana.client.post('/api/rooms', { setId, modeId: 'classic', solo: true, order: 'need' });
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const room = t.deps.rooms.get(mine.body.code)!;
    expect(room.set.questions.map((q) => q.id)).toEqual(['q4', 'q2', 'q5', 'q1', 'q3']);
    expect(room.common.shuffleQuestions).toBe(false);

    // Somebody else's record never orders it: Ben gets his own.
    const his = await ben.client.post('/api/rooms', { setId, modeId: 'classic', solo: true, order: 'need' });
    expect(t.deps.rooms.get(his.body.code)!.set.questions.map((q) => q.id)).toEqual(['q5', 'q1', 'q2', 'q3', 'q4']);

    // Without asking, a solo game is as it always was.
    const plain = await ana.client.post('/api/rooms', { setId, modeId: 'classic', solo: true });
    expect(t.deps.rooms.get(plain.body.code)!.set.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(t.deps.rooms.get(plain.body.code)!.common.shuffleQuestions).toBe(true);
  });

  it('a game with other people is never ordered for one of them', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const setId = (await teacher.client.post('/api/sets', { title: 'Facts', subject: 'science', visibility: 'private', questions: QUESTIONS })).body.set.id as string;
    await played(teacher.userId, setId, at(3), [['q3', false]]);
    const hosted = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', order: 'need' });
    expect(hosted.status, JSON.stringify(hosted.body)).toBe(200);
    const room = t.deps.rooms.get(hosted.body.code)!;
    expect(room.set.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(room.common.shuffleQuestions).toBe(true);
    expect((await teacher.client.post('/api/rooms', { setId, modeId: 'classic', solo: true, order: 'hardest' })).status).toBe(400);
  });
});
