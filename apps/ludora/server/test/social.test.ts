import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, createTestApp, registered, uniqueName, type TestContext } from './helpers.ts';
import { answerEvents, featureFlags, gameParticipants, gameSessions, users } from '../src/db/schema.ts';
import { clearFlagCache } from '../src/modules/flags/service.ts';

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

type Account = Awaited<ReturnType<typeof registered>>;
const codeOf = async (a: Account) => (await a.client.get('/api/friends')).body.friendCode as string;
const setPrivacy = (a: Account, privacy: object) => a.client.patch('/api/me/preferences', { privacy });

describe('friends', () => {
  it('staff can switch friends off, and blocks keep working while they are', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const code = await codeOf(b);
    await t.db.update(featureFlags).set({ enabled: false }).where(eq(featureFlags.key, 'social.friends'));
    clearFlagCache();
    try {
      expect((await a.client.get('/api/friends')).status).toBe(403);
      expect((await a.client.post('/api/friends/request', { friendCode: code })).body.error.code).toBe('not_available');
      expect((await a.client.get('/api/leaderboards?scope=friends')).status).toBe(403);
      expect((await a.client.get(`/api/profiles/${b.userId}`)).body.canRequest).toBe(false);
      expect((await a.client.post('/api/blocks', { userId: b.userId })).status).toBe(200);
      expect((await a.client.delete(`/api/blocks/${b.userId}`)).status).toBe(200);
    } finally {
      await t.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, 'social.friends'));
      clearFlagCache();
    }
    expect((await a.client.post('/api/friends/request', { friendCode: code })).status).toBe(200);
  });

  it('asks by friend code, accepts, lists and removes', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const ask = await a.client.post('/api/friends/request', { friendCode: (await codeOf(b)).toLowerCase() });
    expect(ask.status, JSON.stringify(ask.body)).toBe(200);
    expect(ask.body.status).toBe('pending');
    expect((await a.client.post('/api/friends/request', { friendCode: await codeOf(b) })).status).toBe(409);
    const bList = await b.client.get('/api/friends');
    expect(bList.body.incoming.map((x: { id: string }) => x.id)).toEqual([a.userId]);
    expect((await b.client.post(`/api/friends/${a.userId}/accept`)).status).toBe(200);
    const aList = await a.client.get('/api/friends');
    expect(aList.body.friends.map((x: { id: string }) => x.id)).toEqual([b.userId]);
    expect(aList.body.friends[0]).not.toHaveProperty('username');
    expect((await a.client.delete(`/api/friends/${b.userId}`)).status).toBe(200);
    expect((await b.client.get('/api/friends')).body.friends).toHaveLength(0);
  });

  it('asking back accepts a pending request', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    await a.client.post('/api/friends/request', { friendCode: await codeOf(b) });
    const back = await b.client.post('/api/friends/request', { friendCode: await codeOf(a) });
    expect(back.body.status).toBe('accepted');
  });

  it('follows the receiver privacy setting and never says why', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    await setPrivacy(b, { allowFriendRequests: 'friend_code' });
    const byId = await a.client.post('/api/friends/request', { userId: b.userId });
    expect(byId.status).toBe(403);
    expect((await a.client.post('/api/friends/request', { friendCode: await codeOf(b) })).status).toBe(200);
    const c = await registered(t.app);
    await setPrivacy(c, { allowFriendRequests: 'nobody' });
    const nobody = await a.client.post('/api/friends/request', { friendCode: await codeOf(c) });
    expect(nobody.status).toBe(403);
    expect(nobody.body.error.message).toBe(byId.body.error.message);
  });

  it('guests cannot use friends', async () => {
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await guest.get('/api/friends')).status).toBe(403);
  });

  it('starts players under 13 on friend-code-only requests', async () => {
    const kid = new Client(t.app);
    const year = new Date().getUTCFullYear() - 10;
    await kid.post('/api/auth/register', { username: uniqueName('kid'), password: 'a long passphrase', accountType: 'student', birthYear: year });
    const me = await kid.get('/api/auth/me');
    expect(me.body.user.preferences.privacy.allowFriendRequests).toBe('friend_code');
    expect(me.body.user.preferences.privacy.profileVisibility).toBe('friends');
  });
});

describe('blocks', () => {
  it('removes the friendship, stops requests and hides the profile from the blocked player', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    await a.client.post('/api/friends/request', { friendCode: await codeOf(b) });
    await b.client.post(`/api/friends/${a.userId}/accept`);
    expect((await b.client.post('/api/blocks', { userId: a.userId })).status).toBe(200);
    expect((await a.client.get('/api/friends')).body.friends).toHaveLength(0);
    const ask = await a.client.post('/api/friends/request', { friendCode: await codeOf(b) });
    expect(ask.status).toBe(403);
    expect(ask.body.error.message).toBe('That player is not accepting friend requests right now.');
    expect((await a.client.get(`/api/profiles/${b.userId}`)).status).toBe(404);
    const mine = await b.client.get(`/api/profiles/${a.userId}`);
    expect(mine.body).toMatchObject({ blockedByMe: true, restricted: true });
    expect((await b.client.get('/api/blocks')).body.blocked.map((x: { id: string }) => x.id)).toEqual([a.userId]);
    await b.client.delete(`/api/blocks/${a.userId}`);
    expect((await a.client.get(`/api/profiles/${b.userId}`)).status).toBe(200);
  });
});

async function playedGame(opts: { hostUserId: string; players: { userId: string; correct: number; answered: number; rank: number }[]; classId?: string; assignmentId?: string; answers?: { userId: string; questionId: string; correct: boolean; kind?: string }[]; setId?: string; solo?: boolean }) {
  const [g] = await t.db
    .insert(gameSessions)
    .values({ roomCode: '123456', modeId: 'classic', hostUserId: opts.hostUserId, setId: opts.setId ?? null, setTitle: 'Test set', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: opts.players.length, classId: opts.classId ?? null, assignmentId: opts.assignmentId ?? null, isSolo: opts.solo ?? Boolean(opts.assignmentId), startedAt: new Date(Date.now() - 60_000), endedAt: new Date(), durationMs: 60_000 })
    .returning();
  await t.db.insert(gameParticipants).values(opts.players.map((p, i) => ({ gameId: g!.id, userId: p.userId, playerKey: `p${i}`, displayName: `Player ${i}`, isGuest: false, isBot: false, rank: p.rank, score: p.correct * 100, label: '', answered: p.answered, correct: p.correct, avgResponseMs: 2000, bestStreak: 1 })));
  if (opts.answers?.length) {
    await t.db.insert(answerEvents).values(opts.answers.map((a) => ({ gameId: g!.id, userId: a.userId, playerKey: `p${opts.players.findIndex((p) => p.userId === a.userId)}`, setId: opts.setId ?? null, questionId: a.questionId, correct: a.correct, partial: a.correct ? 1 : 0, responseMs: 1500, kind: a.kind ?? 'answer' })));
  }
  return g!.id;
}

describe('leaderboards', () => {
  it('ranks friends this week, and the global board shows names only without guests, test accounts or opt-outs', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const tester = await registered(t.app);
    const shy = await registered(t.app);
    await t.db.update(users).set({ isTestAccount: true }).where(eq(users.id, tester.userId));
    await setPrivacy(shy, { showOnLeaderboards: false });
    await a.client.post('/api/friends/request', { friendCode: await codeOf(b) });
    await b.client.post(`/api/friends/${a.userId}/accept`);
    await playedGame({ hostUserId: a.userId, players: [{ userId: a.userId, correct: 900, answered: 900, rank: 1 }, { userId: b.userId, correct: 800, answered: 900, rank: 2 }, { userId: tester.userId, correct: 999, answered: 999, rank: 1 }, { userId: shy.userId, correct: 950, answered: 999, rank: 1 }] });

    const friends = await a.client.get('/api/leaderboards?scope=friends&period=week');
    expect(friends.body.entries.map((e: { id: string }) => e.id)).toEqual([a.userId, b.userId]);
    const global = await b.client.get('/api/leaderboards?scope=global&period=week');
    const names = global.body.entries;
    expect(names[0]).toMatchObject({ rank: 1, score: 900 });
    expect(names[0]).not.toHaveProperty('id');
    expect(names.find((e: { me: boolean }) => e.me)).toHaveProperty('id', b.userId);
    const json = JSON.stringify(global.body);
    expect(json).not.toContain(tester.userId);
    expect(json).not.toContain(shy.userId);
    expect(json).not.toContain('username');
  });
});

describe('classes and assignments', () => {
  let teacher: Account;
  let student: Account;
  let other: Account;
  let classId: string;
  let setId: string;

  beforeAll(async () => {
    teacher = await registered(t.app, { accountType: 'teacher' });
    student = await registered(t.app, { accountType: 'student' });
    other = await registered(t.app, { accountType: 'student' });
    const set = await teacher.client.post('/api/sets', {
      title: 'Teacher private set',
      description: 'For the class',
      subject: 'science',
      visibility: 'private',
      questions: [
        { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
        { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
        { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
      ],
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    setId = set.body.set.id;
  });

  it('only teacher accounts create classes; students join with the code', async () => {
    expect((await student.client.post('/api/classes', { name: 'Not allowed' })).status).toBe(403);
    const made = await teacher.client.post('/api/classes', { name: 'Year 7 Science' });
    expect(made.status).toBe(200);
    classId = made.body.class.id;
    expect(made.body.class.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    const join = await student.client.post('/api/classes/join', { code: made.body.class.joinCode.toLowerCase() });
    expect(join.body).toMatchObject({ ok: true, alreadyMember: false });
    expect((await other.client.get(`/api/classes/${classId}`)).status).toBe(404);
  });

  it('sets an assignment from a private set that students can still play, without seeing the answers', async () => {
    const a = await teacher.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Science check', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    // The set itself stays private: students cannot open it, or its answers, outside the game.
    expect((await student.client.get(`/api/sets/${setId}`)).status).toBe(404);
    const play = await student.client.post(`/api/assignments/${a.body.assignment.id}/play`);
    expect(play.status, JSON.stringify(play.body)).toBe(200);
    const room = t.deps.rooms.get(play.body.code)!;
    expect(room.solo).toBe(true);
    expect(room.assignmentId).toBe(a.body.assignment.id);
    expect(room.classId).toBe(classId);
    expect((await other.client.post(`/api/assignments/${a.body.assignment.id}/play`)).status).toBe(404);
    const mine = (await teacher.client.get('/api/classes')).body.teaching.find((c: { id: string }) => c.id === classId);
    expect(mine).toMatchObject({ members: 1, assignments: 1 });
  });

  it('reports to the teacher only, judging each question on the first try', async () => {
    const list = await teacher.client.get(`/api/classes/${classId}`);
    const aid = list.body.assignments[0].id;
    await playedGame({
      hostUserId: student.userId,
      classId,
      assignmentId: aid,
      setId,
      players: [{ userId: student.userId, correct: 2, answered: 3, rank: 1 }],
      answers: [
        { userId: student.userId, questionId: 'q1', correct: true },
        { userId: student.userId, questionId: 'q2', correct: false, kind: 'attempt' },
        { userId: student.userId, questionId: 'q2', correct: true, kind: 'attempt' },
        { userId: student.userId, questionId: 'q3', correct: true, kind: 'self' },
      ],
    });
    expect((await student.client.get(`/api/classes/${classId}/assignments/${aid}/report`)).status).toBe(403);
    const report = await teacher.client.get(`/api/classes/${classId}/assignments/${aid}/report`);
    expect(report.status).toBe(200);
    expect(report.body.summary).toMatchObject({ students: 1, started: 1 });
    expect(report.body.students[0]).toMatchObject({ id: student.userId, attempts: 1, best: { correct: 2, answered: 3 } });
    const q2 = report.body.questions.find((q: { questionId: string }) => q.questionId === 'q2');
    expect(q2).toMatchObject({ prompt: 'The Moon is a planet.', players: 1, firstTryRate: 0, attempts: 2 });
    // Self-graded answers stay out of the report.
    expect(report.body.questions.some((q: { questionId: string }) => q.questionId === 'q3')).toBe(false);
    // The student sees their own result and no roster.
    const mine = await student.client.get(`/api/classes/${classId}`);
    expect(mine.body.members).toBeNull();
    expect(mine.body.class).not.toHaveProperty('joinCode');
    expect(mine.body.assignments[0].mine).toMatchObject({ plays: 1, bestCorrect: 2 });
  });

  it('game reports are for the host or the class teacher', async () => {
    const gid = await playedGame({ hostUserId: teacher.userId, players: [{ userId: student.userId, correct: 1, answered: 2, rank: 1 }] });
    expect((await teacher.client.get(`/api/games/${gid}/report`)).status).toBe(200);
    expect((await other.client.get(`/api/games/${gid}/report`)).status).toBe(404);
    const hosted = await teacher.client.get('/api/me/hosted');
    expect(hosted.body.games.some((g: { id: string }) => g.id === gid)).toBe(true);
  });

  it('a student can leave; the teacher can remove students', async () => {
    expect((await student.client.delete(`/api/classes/${classId}/members/${student.userId}`)).status).toBe(200);
    expect((await student.client.get(`/api/classes/${classId}`)).status).toBe(404);
  });
});

describe('account type', () => {
  it('anyone with an account can switch to teacher, with the rules that keep it safe', async () => {
    const p = await registered(t.app);
    expect((await p.client.post('/api/classes', { name: 'Not yet' })).status).toBe(403);
    expect((await p.client.patch('/api/me/account-type', { accountType: 'teacher' })).status).toBe(200);
    const made = await p.client.post('/api/classes', { name: 'Year 5 Maths' });
    expect(made.status).toBe(200);
    // A teacher with an active class archives it before switching away.
    expect((await p.client.patch('/api/me/account-type', { accountType: 'player' })).status).toBe(409);
    expect((await p.client.patch(`/api/classes/${made.body.class.id}`, { archived: true })).status).toBe(200);
    expect((await p.client.patch('/api/me/account-type', { accountType: 'player' })).status).toBe(200);
    // Under-13 accounts cannot become teachers, and guests have no account type to change.
    const child = new Client(t.app);
    expect((await child.post('/api/auth/register', { username: uniqueName('kid'), password: 'correct horse battery', birthYear: new Date().getFullYear() - 10, accountType: 'student' })).status).toBe(200);
    expect((await child.patch('/api/me/account-type', { accountType: 'teacher' })).status).toBe(403);
    const guest = new Client(t.app);
    await guest.post('/api/auth/guest', {});
    expect((await guest.patch('/api/me/account-type', { accountType: 'teacher' })).status).toBe(403);
  });

  it('refuses assignments and solo rooms that would wait for a host', async () => {
    const teacher = await registered(t.app, { accountType: 'teacher' });
    const cls = await teacher.client.post('/api/classes', { name: 'Discussion test' });
    const set = await teacher.client.post('/api/sets', { title: 'Three facts', description: 'For a solo test', subject: 'science', visibility: 'private', questions: [{ id: 'a', type: 'truefalse', prompt: 'Ice floats.', correct: true }, { id: 'b', type: 'truefalse', prompt: 'Fish fly.', correct: false }, { id: 'c', type: 'truefalse', prompt: 'Owls hoot.', correct: true }] });
    const discussion = await teacher.client.post(`/api/classes/${cls.body.class.id}/assignments`, { setId: set.body.set.id, modeId: 'classic', variantId: 'classic-discussion', title: 'Talk it through' });
    expect(discussion.status).toBe(409);
    expect(discussion.body.error.message).toMatch(/waits for a host/);
    const solo = await teacher.client.post('/api/rooms', { setId: set.body.set.id, modeId: 'classic', solo: true, settings: { autoAdvance: false } });
    expect(solo.status).toBe(409);
    const quick = await teacher.client.post(`/api/classes/${cls.body.class.id}/assignments`, { setId: set.body.set.id, modeId: 'classic', title: 'Quick check' });
    expect(quick.status).toBe(200);
    // A set an assignment uses cannot be deleted out from under the class.
    const refused = await teacher.client.delete(`/api/sets/${set.body.set.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/class assignment uses this set/);
    expect((await teacher.client.delete(`/api/classes/${cls.body.class.id}/assignments/${quick.body.assignment.id}`)).status).toBe(200);
    expect((await teacher.client.delete(`/api/sets/${set.body.set.id}`)).status).toBe(200);
  });
});

describe('my stats', () => {
  it('summarises by mode and subject and lists questions to practise', async () => {
    const p = await registered(t.app);
    const set = await p.client.post('/api/sets', { title: 'Mine', description: 'Practice', subject: 'math', visibility: 'private', questions: [{ id: 'm1', type: 'numeric', prompt: 'What is 7 x 8?', answer: 56 }, { id: 'm2', type: 'truefalse', prompt: '0 is even.', correct: true }, { id: 'm3', type: 'truefalse', prompt: '1 is prime.', correct: false }] });
    await playedGame({ hostUserId: p.userId, setId: set.body.set.id, players: [{ userId: p.userId, correct: 1, answered: 2, rank: 1 }], answers: [{ userId: p.userId, questionId: 'm1', correct: false }, { userId: p.userId, questionId: 'm2', correct: true }] });
    const stats = await p.client.get('/api/me/stats');
    expect(stats.body.byMode[0]).toMatchObject({ modeId: 'classic', games: 1, correct: 1, answered: 2 });
    expect(stats.body.bySubject[0]).toMatchObject({ subject: 'math', games: 1 });
    expect(stats.body.practise.map((x: { prompt: string }) => x.prompt)).toEqual(['What is 7 x 8?']);
  });

  it('counts every game you hosted, the same games the hosted list shows', async () => {
    const host = await registered(t.app, { accountType: 'teacher' });
    const a = await registered(t.app);
    const b = await registered(t.app);
    const player = (userId: string, rank: number) => ({ userId, correct: 1, answered: 2, rank });
    // One player earns no hosting reward, but it was still a game you hosted.
    await playedGame({ hostUserId: host.userId, players: [player(a.userId, 1)] });
    await playedGame({ hostUserId: host.userId, players: [player(a.userId, 1), player(b.userId, 2)] });
    // Playing on your own is not hosting.
    await playedGame({ hostUserId: host.userId, players: [player(host.userId, 1)], solo: true });
    const hosted = await host.client.get('/api/me/hosted');
    expect(hosted.body.games).toHaveLength(2);
    const overview = await host.client.get('/api/me/overview');
    expect(overview.body.stats.gamesHosted).toBe(2);
    expect((await a.client.get('/api/me/overview')).body.stats.gamesHosted).toBe(0);
  });
});

describe('game history', () => {
  it('gives a rank out of everyone who played, practice bots included, while the player count stays people only', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const gameId = await playedGame({ hostUserId: a.userId, players: [{ userId: b.userId, correct: 9, answered: 10, rank: 1 }, { userId: a.userId, correct: 2, answered: 10, rank: 5 }] });
    await t.db.insert(gameParticipants).values([2, 3, 4].map((rank) => ({ gameId, userId: null, playerKey: `bot${rank}`, displayName: `Bot ${rank}`, isGuest: true, isBot: true, rank, score: 500, label: '', answered: 10, correct: 5, avgResponseMs: 2000, bestStreak: 1 })));
    expect((await a.client.get('/api/me/history')).body.games[0]).toMatchObject({ gameId, players: 2, entrants: 5, rank: 5 });
    expect((await a.client.get('/api/me/overview')).body.recentGames[0]).toMatchObject({ gameId, players: 2, entrants: 5, rank: 5 });
  });
});
