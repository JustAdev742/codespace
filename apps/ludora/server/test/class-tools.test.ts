import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { answerEvents, auditLog, classGoalBadges, gameParticipants, gameSessions, ledger, questionSets } from '../src/db/schema.ts';
import { gradeCell, mostMissed, needsAHand, studentStatus, weekOf } from '../src/modules/classes/insights.ts';
import { assignmentBlocker } from '../src/modules/classes/access.ts';
import { PASSCODE_WORDS, passcode, usernameStem } from '../src/modules/classes/logins.ts';
import { containsBlockedLanguage } from '@ludora/shared';

/*
 * The teacher's class tools: assignment options, gradebook and insights,
 * mastery and attempts, a student's report and private notes, reteach,
 * notices, the class goal, the leaderboard switch, bulk roster actions and
 * class logins. Every route is checked against the wrong account.
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
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
  { id: 'q4', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
];

async function playedGame(opts: { classId: string; assignmentId: string; setId: string; userId: string; answers: [string, boolean][]; endedAt?: Date }) {
  const endedAt = opts.endedAt ?? new Date();
  const correct = opts.answers.filter(([, c]) => c).length;
  const [g] = await t.db
    .insert(gameSessions)
    .values({ roomCode: '123456', modeId: 'classic', hostUserId: opts.userId, setId: opts.setId, setTitle: 'Test set', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, classId: opts.classId, assignmentId: opts.assignmentId, isSolo: true, startedAt: new Date(endedAt.getTime() - 90_000), endedAt, durationMs: 90_000 })
    .returning();
  await t.db.insert(gameParticipants).values({ gameId: g!.id, userId: opts.userId, playerKey: 'p0', displayName: 'Player', isGuest: false, isBot: false, rank: 1, score: correct * 100, label: '', answered: opts.answers.length, correct, avgResponseMs: 2000, bestStreak: 1 });
  await t.db.insert(answerEvents).values(opts.answers.map(([questionId, c]) => ({ gameId: g!.id, userId: opts.userId, playerKey: 'p0', setId: opts.setId, questionId, correct: c, partial: c ? 1 : 0, responseMs: 1500 })));
  return g!.id;
}

describe('class insight arithmetic', () => {
  const at = (s: string) => new Date(s);
  it('takes the best play, flags all-late work and gives a status', () => {
    const due = at('2026-03-02T09:00:00Z');
    const cell = gradeCell(
      [
        { correct: 2, answered: 4, score: 200, endedAt: at('2026-03-03T09:00:00Z') },
        { correct: 3, answered: 4, score: 250, endedAt: at('2026-03-04T09:00:00Z') },
      ],
      due,
    );
    expect(cell).toMatchObject({ attempts: 2, best: { correct: 3, accuracy: 0.75 }, late: true });
    expect(studentStatus(cell, due, at('2026-03-05T00:00:00Z'))).toBe('late');
    expect(studentStatus(gradeCell([], due), due, at('2026-03-05T00:00:00Z'))).toBe('overdue');
    expect(studentStatus(gradeCell([], null), null, at('2026-03-05T00:00:00Z'))).toBe('todo');
  });
  it('ranks most-missed questions and finds students who may need a hand', () => {
    const tries = [
      { gameId: 'g', userId: 'a', setId: 's', questionId: 'q1', correct: false, at: at('2026-03-01T00:00:00Z') },
      { gameId: 'g', userId: 'b', setId: 's', questionId: 'q1', correct: false, at: at('2026-03-01T00:00:00Z') },
      { gameId: 'g', userId: 'a', setId: 's', questionId: 'q2', correct: true, at: at('2026-03-01T00:00:00Z') },
      { gameId: 'g', userId: 'b', setId: 's', questionId: 'q2', correct: false, at: at('2026-03-01T00:00:00Z') },
    ];
    expect(mostMissed(tries).map((m) => m.questionId)).toEqual(['q1', 'q2']);
    const many = Array.from({ length: 6 }, (_, i) => ({ gameId: 'g', userId: 'a', setId: 's', questionId: `q${i}`, correct: i === 0, at: at('2026-03-01T00:00:00Z') }));
    const help = needsAHand([{ id: 'a', displayName: 'Ann' }, { id: 'b', displayName: 'Ben' }], many, 0.6);
    // Ben has too few answers to judge; Ann got 1 of 6.
    expect(help).toHaveLength(1);
    expect(help[0]).toMatchObject({ id: 'a', answers: 6 });
    expect(help[0]!.missed).toHaveLength(5);
    expect(weekOf(at('2026-03-04T12:00:00Z'))).toBe('2026-03-02');
  });
  it('blocks assignments that are not open, closed or out of attempts', () => {
    const now = at('2026-03-04T12:00:00Z');
    expect(assignmentBlocker({ opensAt: at('2026-03-05T00:00:00Z'), closesAt: null, maxAttempts: null }, 0, now)).toMatch(/opens on/);
    expect(assignmentBlocker({ opensAt: null, closesAt: at('2026-03-04T00:00:00Z'), maxAttempts: null }, 0, now)).toMatch(/closed/);
    expect(assignmentBlocker({ opensAt: null, closesAt: null, maxAttempts: 2 }, 2, now)).toMatch(/all 2 attempts/);
    expect(assignmentBlocker({ opensAt: null, closesAt: null, maxAttempts: 2 }, 1, now)).toBeNull();
  });
  it('makes passcodes from clean words and usernames from names', () => {
    expect(PASSCODE_WORDS.length).toBe(256);
    expect(new Set(PASSCODE_WORDS).size).toBe(256);
    expect(PASSCODE_WORDS.filter((w) => containsBlockedLanguage(w))).toEqual([]);
    expect(passcode()).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
    expect(usernameStem('Zoë-Ann')).toBe('zoeann');
    expect(usernameStem('李')).toBe('student');
  });
});

describe('class tools', () => {
  let teacher: Account;
  let student: Account;
  let second: Account;
  let outsider: Account;
  let otherTeacher: Account;
  let classId: string;
  let otherClassId: string;
  let setId: string;
  let aid: string;

  beforeAll(async () => {
    teacher = await registered(t.app, { accountType: 'teacher' });
    otherTeacher = await registered(t.app, { accountType: 'teacher' });
    student = await registered(t.app, { accountType: 'student' });
    second = await registered(t.app, { accountType: 'student' });
    outsider = await registered(t.app, { accountType: 'student' });
    const set = await teacher.client.post('/api/sets', { title: 'Science facts', subject: 'science', visibility: 'private', questions: QUESTIONS });
    setId = set.body.set.id;
    const made = await teacher.client.post('/api/classes', { name: 'Year 5 Oak' });
    classId = made.body.class.id;
    otherClassId = (await teacher.client.post('/api/classes', { name: 'Year 5 Elm' })).body.class.id;
    await student.client.post('/api/classes/join', { code: made.body.class.joinCode });
    await second.client.post('/api/classes/join', { code: made.body.class.joinCode });
  });

  it('assignment options: opening and closing dates and attempts, held on the server', async () => {
    const bad = await teacher.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Backwards', opensAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), closesAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.closesAt).toBeTruthy();
    const later = await teacher.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Next week', opensAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    expect(later.status, JSON.stringify(later.body)).toBe(200);
    const once = await teacher.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'One go', maxAttempts: 1, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(once.status, JSON.stringify(once.body)).toBe(200);
    aid = once.body.assignment.id;
    // Not open yet: students do not see it and cannot start it; the teacher can try it.
    const seen = await student.client.get(`/api/classes/${classId}`);
    expect(seen.body.assignments.map((a: { title: string }) => a.title)).toEqual(['One go']);
    expect((await student.client.post(`/api/assignments/${later.body.assignment.id}/play`)).status).toBe(409);
    expect((await teacher.client.post(`/api/assignments/${later.body.assignment.id}/play`)).status).toBe(200);
    // One attempt allowed: the second start is refused.
    expect((await student.client.post(`/api/assignments/${aid}/play`)).status).toBe(200);
    await playedGame({ classId, assignmentId: aid, setId, userId: student.userId, answers: [['q1', true], ['q2', false], ['q3', false], ['q4', false]] });
    const refused = await student.client.post(`/api/assignments/${aid}/play`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/one attempt/);
    expect((await student.client.get(`/api/classes/${classId}`)).body.assignments[0].blocked).toMatch(/one attempt/);
    // The teacher allows another go, and then closes it.
    expect((await teacher.client.patch(`/api/classes/${classId}/assignments/${aid}`, { maxAttempts: 3 })).status).toBe(200);
    expect((await student.client.post(`/api/assignments/${aid}/play`)).status).toBe(200);
    expect((await teacher.client.patch(`/api/classes/${classId}/assignments/${aid}`, { closesAt: new Date(Date.now() - 1000).toISOString(), dueAt: null })).status).toBe(200);
    expect((await student.client.post(`/api/assignments/${aid}/play`)).body.error.message).toMatch(/closed/);
    await teacher.client.patch(`/api/classes/${classId}/assignments/${aid}`, { closesAt: null });
    // Students cannot change options.
    expect((await student.client.patch(`/api/classes/${classId}/assignments/${aid}`, { maxAttempts: 20 })).status).toBe(403);
  });

  it('gradebook and insights are for the teacher only', async () => {
    await playedGame({ classId, assignmentId: aid, setId, userId: student.userId, answers: [['q1', true], ['q2', true], ['q3', false], ['q4', false]] });
    await playedGame({ classId, assignmentId: aid, setId, userId: second.userId, answers: [['q1', true], ['q2', true], ['q3', true], ['q4', false]] });
    expect((await student.client.get(`/api/classes/${classId}/insights`)).status).toBe(403);
    expect((await outsider.client.get(`/api/classes/${classId}/insights`)).status).toBe(404);
    expect((await otherTeacher.client.get(`/api/classes/${classId}/insights`)).status).toBe(404);
    const res = await teacher.client.get(`/api/classes/${classId}/insights`);
    expect(res.status).toBe(200);
    const mine = res.body.gradebook.find((g: { id: string }) => g.id === student.userId);
    expect(mine.cells[aid]).toMatchObject({ attempts: 2, best: { correct: 2, answered: 4 } });
    expect(res.body.timeOnTask.find((x: { assignmentId: string }) => x.assignmentId === aid)).toMatchObject({ totalMs: 270_000, students: 2, medianMs: 90_000 });
    expect(res.body.byType).toEqual([expect.objectContaining({ type: 'truefalse', answers: 12 })]);
    expect(res.body.mostMissed[0]).toMatchObject({ questionId: 'q4', prompt: 'Spiders have six legs.', tries: 3, wrong: 3 });
    // The first student got 3 of 8 right first time: under 60%.
    expect(res.body.needsAHand.students.map((s: { id: string }) => s.id)).toEqual([student.userId]);
    expect(res.body.needsAHand.students[0].missed[0].prompt).toBeTruthy();
  });

  it('mastery grid and attempts, question by question', async () => {
    expect((await student.client.get(`/api/classes/${classId}/assignments/${aid}/attempts`)).status).toBe(403);
    const res = await teacher.client.get(`/api/classes/${classId}/assignments/${aid}/attempts`);
    expect(res.status).toBe(200);
    expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    const s = res.body.students.find((x: { id: string }) => x.id === student.userId);
    expect(s.attempts).toHaveLength(2);
    expect(s.attempts[0].results).toEqual({ q1: 'right', q2: 'wrong', q3: 'wrong', q4: 'wrong' });
    expect(s.attempts[1].results.q2).toBe('right');
  });

  it("a student's report: the teacher sees all of it, the student their own without the note, classmates nothing", async () => {
    expect((await teacher.client.put(`/api/classes/${classId}/students/${student.userId}/note`, { body: 'Needs glasses for the board.' })).status).toBe(200);
    expect((await student.client.put(`/api/classes/${classId}/students/${student.userId}/note`, { body: 'hello' })).status).toBe(403);
    expect((await teacher.client.put(`/api/classes/${classId}/students/${outsider.userId}/note`, { body: 'x' })).status).toBe(404);
    const full = await teacher.client.get(`/api/classes/${classId}/students/${student.userId}/report`);
    expect(full.status).toBe(200);
    expect(full.body.note.body).toBe('Needs glasses for the board.');
    expect(full.body.summary).toMatchObject({ done: 1 });
    expect(full.body.assignments.find((a: { id: string }) => a.id === aid)).toMatchObject({ attempts: 2, firstAccuracy: 0.25, lastAccuracy: 0.5 });
    expect(full.body.bySubject[0]).toMatchObject({ subject: 'science', correct: 3, answered: 8 });
    const own = await student.client.get(`/api/classes/${classId}/students/${student.userId}/report`);
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty('note');
    expect(JSON.stringify(own.body)).not.toContain('glasses');
    expect((await second.client.get(`/api/classes/${classId}/students/${student.userId}/report`)).status).toBe(403);
    // The note is in the teacher's own data download, and never in the student's.
    const teacherExport = await teacher.client.get('/api/me/export');
    expect(JSON.stringify(teacherExport.body.tables)).toContain('Needs glasses for the board.');
    expect(JSON.stringify((await student.client.get('/api/me/export')).body)).not.toContain('glasses');
    // The class detail tells the teacher there is a note, and tells students nothing.
    const detail = await teacher.client.get(`/api/classes/${classId}`);
    expect(detail.body.members.find((m: { id: string }) => m.id === student.userId).hasNote).toBe(true);
  });

  it('reteach makes a private set of the most-missed questions in the teacher library', async () => {
    expect((await student.client.post(`/api/classes/${classId}/reteach`, {})).status).toBe(403);
    const res = await teacher.client.post(`/api/classes/${classId}/reteach`, { assignmentId: aid, count: 3 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await t.db.select().from(questionSets).where(eq(questionSets.id, res.body.set.id));
    expect(row).toMatchObject({ ownerId: teacher.userId, visibility: 'private', questionCount: 3 });
    expect((row!.questions as { prompt: string }[])[0]!.prompt).toBe('Spiders have six legs.');
    const fresh = (await teacher.client.post('/api/classes', { name: 'Empty class' })).body.class.id;
    expect((await teacher.client.post(`/api/classes/${fresh}/reteach`, {})).status).toBe(409);
  });

  it('notices go through the name filter; students read them and cannot post', async () => {
    expect((await teacher.client.post(`/api/classes/${classId}/notices`, { body: 'This is shit' })).status).toBe(400);
    expect((await student.client.post(`/api/classes/${classId}/notices`, { body: 'Hello class' })).status).toBe(403);
    const posted = await teacher.client.post(`/api/classes/${classId}/notices`, { body: '  Spelling test on   Friday. ' });
    expect(posted.status).toBe(200);
    expect(posted.body.notice.body).toBe('Spelling test on Friday.');
    const seen = await student.client.get(`/api/classes/${classId}`);
    expect(seen.body.notices[0].body).toBe('Spelling test on Friday.');
    expect((await student.client.delete(`/api/classes/${classId}/notices/${posted.body.notice.id}`)).status).toBe(403);
    expect((await teacher.client.delete(`/api/classes/${classId}/notices/${posted.body.notice.id}`)).status).toBe(200);
  });

  it('class goal: progress from class work, and a badge for every member when reached, with no currency', async () => {
    expect((await student.client.put(`/api/classes/${classId}/goal`, { title: 'Big week', target: 10, endsAt: new Date(Date.now() + 86_400_000).toISOString() })).status).toBe(403);
    const set = await teacher.client.put(`/api/classes/${classId}/goal`, { title: 'Ten right', target: 10, endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    let goal = (await student.client.get(`/api/classes/${classId}`)).body.goal;
    expect(goal).toMatchObject({ title: 'Ten right', target: 10, progress: 0, reachedAt: null, badge: false });
    const ledgerBefore = (await t.db.select().from(ledger)).length;
    await playedGame({ classId, assignmentId: aid, setId, userId: student.userId, answers: [['q1', true], ['q2', true], ['q3', true], ['q4', true]] });
    await playedGame({ classId, assignmentId: aid, setId, userId: second.userId, answers: [['q1', true], ['q2', true], ['q3', true], ['q4', true]] });
    await playedGame({ classId, assignmentId: aid, setId, userId: second.userId, answers: [['q1', true], ['q2', true], ['q3', false], ['q4', false]] });
    goal = (await student.client.get(`/api/classes/${classId}`)).body.goal;
    expect(goal.progress).toBe(10);
    expect(goal.reachedAt).toBeTruthy();
    expect(goal.badge).toBe(true);
    const badges = await t.db.select().from(classGoalBadges).where(eq(classGoalBadges.goalId, goal.id));
    expect(badges.map((b) => b.userId).sort()).toEqual([student.userId, second.userId].sort());
    expect((await second.client.get(`/api/classes/${classId}/badges`)).body.badges[0]).toMatchObject({ title: 'Ten right' });
    expect((await t.db.select().from(ledger)).length).toBe(ledgerBefore);
  });

  it('the teacher can turn the weekly class leaderboard off', async () => {
    expect((await student.client.get(`/api/leaderboards?scope=class&classId=${classId}&period=week`)).status).toBe(200);
    expect((await student.client.patch(`/api/classes/${classId}`, { leaderboardOn: false })).status).toBe(403);
    expect((await teacher.client.patch(`/api/classes/${classId}`, { leaderboardOn: false })).status).toBe(200);
    const off = await student.client.get(`/api/leaderboards?scope=class&classId=${classId}&period=week`);
    expect(off.status).toBe(409);
    expect(off.body.error.message).toMatch(/turned off/);
    expect((await teacher.client.get(`/api/leaderboards?scope=class&classId=${classId}&period=week`)).status).toBe(200);
    expect((await student.client.get(`/api/classes/${classId}`)).body.class.leaderboardOn).toBe(false);
    await teacher.client.patch(`/api/classes/${classId}`, { leaderboardOn: true });
  });

  it('bulk: moves students (with their note) to another of the same teacher’s classes, and removes several', async () => {
    const theirs = (await otherTeacher.client.post('/api/classes', { name: 'Not yours' })).body.class.id;
    expect((await teacher.client.post(`/api/classes/${classId}/members/bulk`, { action: 'move', userIds: [student.userId], toClassId: theirs })).status).toBe(404);
    expect((await student.client.post(`/api/classes/${classId}/members/bulk`, { action: 'remove', userIds: [second.userId] })).status).toBe(403);
    const moved = await teacher.client.post(`/api/classes/${classId}/members/bulk`, { action: 'move', userIds: [student.userId, second.userId], toClassId: otherClassId });
    expect(moved.body).toMatchObject({ ok: true, done: 2 });
    expect((await student.client.get(`/api/classes/${classId}`)).status).toBe(404);
    expect((await teacher.client.get(`/api/classes/${otherClassId}/students/${student.userId}/report`)).body.note.body).toBe('Needs glasses for the board.');
    const removed = await teacher.client.post(`/api/classes/${otherClassId}/members/bulk`, { action: 'remove', userIds: [student.userId, second.userId, outsider.userId] });
    expect(removed.body).toMatchObject({ ok: true, done: 2 });
    expect((await teacher.client.get(`/api/classes/${otherClassId}`)).body.members).toEqual([]);
  });

  it('class logins: accounts from first names, passcodes once, reset only by that class’s teacher', async () => {
    const bad = await teacher.client.post(`/api/classes/${classId}/logins`, { names: ['Amira', 'x'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Line 2/);
    expect((await student.client.post(`/api/classes/${classId}/logins`, { names: ['Amira'] })).status).toBe(404);
    const res = await teacher.client.post(`/api/classes/${classId}/logins`, { names: ['Amira', '', 'Zoë'] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.accounts).toHaveLength(2);
    const amira = res.body.accounts[0];
    expect(amira.username).toMatch(/^amira\d{3}$/);
    expect(res.body.accounts[1].username).toMatch(/^zoe\d{3}$/);
    expect(amira.passcode).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
    // The student signs in with the username and passcode, and is in the class.
    const kid = new Client(t.app);
    expect((await kid.post('/api/auth/login', { username: amira.username, password: amira.passcode })).status).toBe(200);
    const me = await kid.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ accountType: 'student', ageBand: 'under13', displayName: 'Amira' });
    expect((await kid.get(`/api/classes/${classId}`)).status).toBe(200);
    // Stored hashed; the audit log never holds the passcode.
    expect(JSON.stringify(await t.db.select().from(auditLog))).not.toContain(amira.passcode);
    const roster = (await teacher.client.get(`/api/classes/${classId}`)).body.members;
    expect(roster.find((m: { id: string }) => m.id === amira.userId).classLogin).toBe(true);
    // Reset: only this class's teacher; the old passcode stops working and the student is signed out.
    expect((await otherTeacher.client.post(`/api/classes/${classId}/logins/${amira.userId}/passcode`)).status).toBe(404);
    expect((await teacher.client.post(`/api/classes/${otherClassId}/logins/${amira.userId}/passcode`)).status).toBe(404);
    const reset = await teacher.client.post(`/api/classes/${classId}/logins/${amira.userId}/passcode`);
    expect(reset.status).toBe(200);
    expect((await kid.get('/api/auth/me')).body.user).toBeFalsy();
    expect((await new Client(t.app).post('/api/auth/login', { username: amira.username, password: amira.passcode })).status).toBe(401);
    expect((await new Client(t.app).post('/api/auth/login', { username: amira.username, password: reset.body.account.passcode })).status).toBe(200);
    // Students who signed up themselves have no class login to reset.
    const joiner = await registered(t.app, { accountType: 'student' });
    const code = (await teacher.client.get(`/api/classes/${classId}`)).body.class.joinCode;
    await joiner.client.post('/api/classes/join', { code });
    expect((await teacher.client.post(`/api/classes/${classId}/logins/${joiner.userId}/passcode`)).status).toBe(404);
  });
});
