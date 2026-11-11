import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { gameParticipants, gameSessions, questionSets } from '../src/db/schema.ts';

/*
 * Co-teachers and class groups. Every class route is checked for the owner and for a co-teacher,
 * and refused to a third teacher (404, saying nothing about the class) and to a student (403 for
 * teacher-only routes). A co-teacher is added by exact username, and the answer for an unknown
 * username is the same as for a student's, so the form reveals nothing about accounts. A student
 * sees, starts and is reminded about only the whole class's work and their own group's.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let owner: Account;
let co: Account;
let third: Account;
let ada: Account;
let bo: Account;
let classId: string;
let setId: string;
let joinCode: string;

const QUESTIONS = [
  { id: 'q1', type: 'truefalse', prompt: 'Water boils at 100 C at sea level.', correct: true },
  { id: 'q2', type: 'truefalse', prompt: 'The Moon is a planet.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'Bats are mammals.', correct: true },
];

beforeAll(async () => {
  t = await createTestApp();
  owner = await registered(t.app, { accountType: 'teacher' });
  co = await registered(t.app, { accountType: 'teacher' });
  third = await registered(t.app, { accountType: 'teacher' });
  ada = await registered(t.app, { accountType: 'student' });
  bo = await registered(t.app, { accountType: 'student' });
  const made = await owner.client.post('/api/classes', { name: 'Year 4 Rowan' });
  classId = made.body.class.id;
  joinCode = made.body.class.joinCode;
  for (const s of [ada, bo]) expect((await s.client.post('/api/classes/join', { code: joinCode })).status).toBe(200);
  const [set] = await t.db.insert(questionSets).values({ ownerId: owner.userId, title: 'Science facts', subject: 'science', visibility: 'unlisted', questions: QUESTIONS, questionCount: QUESTIONS.length }).returning({ id: questionSets.id });
  setId = set!.id;
});
afterAll(async () => {
  await t?.close();
});

describe('co-teachers', () => {
  it('are added by exact username, by the owner only, and an unknown name says no more than a student’s', async () => {
    const unknown = await owner.client.post(`/api/classes/${classId}/teachers`, { username: 'nobody_here_at_all' });
    const student = await owner.client.post(`/api/classes/${classId}/teachers`, { username: ada.username });
    expect(unknown.status).toBe(404);
    expect(student.status).toBe(404);
    expect(student.body).toEqual(unknown.body);
    expect(JSON.stringify(student.body)).not.toContain(ada.username);
    // Not the start of a username either: exact only.
    expect((await owner.client.post(`/api/classes/${classId}/teachers`, { username: co.username.slice(0, -1) })).status).toBe(404);
    // Nobody but the owner adds teachers.
    expect((await third.client.post(`/api/classes/${classId}/teachers`, { username: third.username })).status).toBe(404);
    expect((await ada.client.post(`/api/classes/${classId}/teachers`, { username: co.username })).status).toBe(403);
    const ok = await owner.client.post(`/api/classes/${classId}/teachers`, { username: co.username.toUpperCase() });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.teacher).toEqual({ id: co.userId, displayName: expect.any(String), owner: false });
    expect(JSON.stringify(ok.body)).not.toMatch(/username|email|password/i);
    expect((await owner.client.post(`/api/classes/${classId}/teachers`, { username: co.username })).status).toBe(409);
    // The new teacher is told, and sees the class in their list.
    const notes = (await co.client.get('/api/notifications')).body.items;
    expect(notes.some((n: { link: string }) => n.link === `/classes/${classId}`)).toBe(true);
    const list = (await co.client.get('/api/classes')).body.teaching;
    expect(list.find((c: { id: string }) => c.id === classId)).toMatchObject({ coTeacher: true });
    // A co-teacher cannot join their own class as a student.
    expect((await co.client.post('/api/classes/join', { code: joinCode })).status).toBe(409);
  });

  it('can run the class, and a third teacher and a student are refused on every route', async () => {
    const made = await co.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Facts check' });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const aid = made.body.assignment.id as string;
    const reads = [
      `/api/classes/${classId}`,
      `/api/classes/${classId}/insights`,
      `/api/classes/${classId}/assignments/${aid}/report`,
      `/api/classes/${classId}/assignments/${aid}/attempts`,
      `/api/classes/${classId}/students/${ada.userId}/report`,
      `/api/classes/${classId}/live-games`,
      `/api/classes/${classId}/extra-time`,
      `/api/classes/${classId}/badges`,
    ];
    for (const url of reads) {
      for (const who of [owner, co]) {
        const r = await who.client.get(url);
        expect(r.status, `${url}: ${JSON.stringify(r.body)}`).toBe(200);
      }
      expect((await third.client.get(url)).status, url).toBe(404);
    }
    // Teacher-only reads tell a student why; the class page and their own report are theirs to see.
    for (const url of reads.filter((u) => u !== `/api/classes/${classId}` && !u.includes(`/students/${ada.userId}/`) && !u.endsWith('/badges'))) {
      expect((await ada.client.get(url)).status, url).toBe(403);
    }
    expect((await bo.client.get(`/api/classes/${classId}/students/${ada.userId}/report`)).status).toBe(403);
    // The class page shows the teacher's view to both teachers, with both names.
    const detail = (await co.client.get(`/api/classes/${classId}`)).body;
    expect(detail.role).toBe('teacher');
    expect(detail.owner).toBe(false);
    expect(detail.teachers.map((x: { id: string; owner: boolean }) => [x.id, x.owner])).toEqual([
      [owner.userId, true],
      [co.userId, false],
    ]);
    expect(detail.members.map((m: { id: string }) => m.id).sort()).toEqual([ada.userId, bo.userId].sort());
    // Writes: a co-teacher can post a notice and change an assignment; others cannot.
    const writes: [string, string, unknown][] = [
      ['POST', `/api/classes/${classId}/notices`, { body: 'Bring your reading books on Friday.' }],
      ['PATCH', `/api/classes/${classId}/assignments/${aid}`, { title: 'Facts check two' }],
      ['POST', `/api/classes/${classId}/code`, {}],
      ['PATCH', `/api/classes/${classId}`, { name: 'Year 4 Rowan class' }],
    ];
    for (const [method, url, body] of writes) {
      const send = (who: Account) => who.client.request(method as 'POST' | 'PATCH', url, body);
      expect((await send(third)).status, url).toBe(404);
      expect((await send(ada)).status, url).toBe(403);
      const r = await send(co);
      expect(r.status, `${url}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    // A co-teacher can host a live game for the class.
    const room = await co.client.post('/api/rooms', { setId, modeId: 'classic', classId });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    expect((await third.client.post('/api/rooms', { setId, modeId: 'classic', classId })).status).not.toBe(200);
  });

  it('leaves archiving and the teacher list to the owner, and can leave the class', async () => {
    expect((await co.client.patch(`/api/classes/${classId}`, { archived: true })).status).toBe(403);
    expect((await co.client.post(`/api/classes/${classId}/teachers`, { username: third.username })).status).toBe(403);
    expect((await co.client.delete(`/api/classes/${classId}/teachers/${owner.userId}`)).status).toBe(403);
    expect((await third.client.delete(`/api/classes/${classId}/teachers/${co.userId}`)).status).toBe(404);
    // A game played in the class: its report is for both teachers.
    const [g] = await t.db
      .insert(gameSessions)
      .values({ roomCode: '123456', modeId: 'classic', hostUserId: owner.userId, setId, setTitle: 'Science facts', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, classId, startedAt: new Date(Date.now() - 60_000), endedAt: new Date(), durationMs: 60_000 })
      .returning();
    await t.db.insert(gameParticipants).values({ gameId: g!.id, userId: ada.userId, playerKey: 'p1', displayName: 'Ada', isGuest: false, isBot: false, rank: 1, score: 100, label: '', answered: 1, correct: 1, avgResponseMs: 1000, bestStreak: 1 });
    expect((await co.client.get(`/api/games/${g!.id}/report`)).status).toBe(200);
    expect((await third.client.get(`/api/games/${g!.id}/report`)).status).toBe(404);
    // The co-teacher leaves; then the class is no longer theirs.
    expect((await co.client.delete(`/api/classes/${classId}/teachers/${co.userId}`)).status).toBe(200);
    expect((await co.client.get(`/api/classes/${classId}`)).status).toBe(404);
    expect((await co.client.get(`/api/games/${g!.id}/report`)).status).toBe(404);
    // And back again, for the group tests.
    expect((await owner.client.post(`/api/classes/${classId}/teachers`, { username: co.username })).status).toBe(200);
  });
});

describe('class groups', () => {
  let groupId: string;
  let groupWork: string;
  let classWork: string;

  it('are made by either teacher, with names through the filter, and refused to others', async () => {
    expect((await third.client.post(`/api/classes/${classId}/groups`, { name: 'Table 1' })).status).toBe(404);
    expect((await ada.client.post(`/api/classes/${classId}/groups`, { name: 'Table 1' })).status).toBe(403);
    expect((await owner.client.post(`/api/classes/${classId}/groups`, { name: '   ' })).status).toBe(400);
    const made = await co.client.post(`/api/classes/${classId}/groups`, { name: 'Robins', memberIds: [ada.userId, third.userId] });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    groupId = made.body.group.id;
    expect((await owner.client.post(`/api/classes/${classId}/groups`, { name: 'robins' })).status).toBe(409);
    const detail = (await owner.client.get(`/api/classes/${classId}`)).body;
    // Only class members join a group: the outsider in the list was ignored.
    expect(detail.groups).toEqual([{ id: groupId, name: 'Robins', memberIds: [ada.userId] }]);
    expect((await third.client.patch(`/api/classes/${classId}/groups/${groupId}`, { name: 'Wrens' })).status).toBe(404);
    expect((await bo.client.patch(`/api/classes/${classId}/groups/${groupId}`, { memberIds: [bo.userId] })).status).toBe(403);
  });

  it('let work be set for one group: only its students see it, start it or are reminded of it', async () => {
    const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
    const g = await owner.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Robins reading', groupId, dueAt: soon });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    groupWork = g.body.assignment.id;
    classWork = (await owner.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Everyone', dueAt: soon })).body.assignment.id;
    // A group from another class is refused.
    const other = await third.client.post('/api/classes', { name: 'Other class' });
    const otherGroup = await third.client.post(`/api/classes/${other.body.class.id}/groups`, { name: 'Elsewhere' });
    expect((await owner.client.post(`/api/classes/${classId}/assignments`, { setId, modeId: 'classic', title: 'Wrong group', groupId: otherGroup.body.group.id })).status).toBe(400);

    const titles = async (who: Account) => (await who.client.get(`/api/classes/${classId}`)).body.assignments.map((a: { title: string }) => a.title);
    expect(await titles(ada)).toEqual(expect.arrayContaining(['Robins reading', 'Everyone']));
    expect(await titles(bo)).not.toContain('Robins reading');
    expect(await titles(bo)).toContain('Everyone');
    const adaView = (await ada.client.get(`/api/classes/${classId}`)).body;
    expect(adaView.myGroups).toEqual([{ id: groupId, name: 'Robins' }]);
    expect(adaView.groups).toBeNull();
    expect(JSON.stringify((await bo.client.get(`/api/classes/${classId}`)).body)).not.toContain('Robins');
    // Starting it: Ada can, Bo cannot (and is not told it exists).
    expect((await ada.client.post(`/api/assignments/${groupWork}/play`)).status).toBe(200);
    expect((await bo.client.post(`/api/assignments/${groupWork}/play`)).status).toBe(404);
    // Reminders of work due soon.
    const due = async (who: Account) => (await who.client.get('/api/notifications')).body.due.map((n: { title: string }) => n.title);
    expect(await due(ada)).toContain('Due soon: Robins reading');
    expect(await due(bo)).not.toContain('Due soon: Robins reading');
    expect(await due(bo)).toContain('Due soon: Everyone');
    // The teacher's views: started of the group's size, gradebook cells only for the group.
    const teacherView = (await co.client.get(`/api/classes/${classId}`)).body.assignments.find((a: { id: string }) => a.id === groupWork);
    expect(teacherView).toMatchObject({ groupId, groupName: 'Robins', of: 1 });
    const insights = (await owner.client.get(`/api/classes/${classId}/insights`)).body;
    const row = (id: string) => insights.gradebook.find((r: { id: string }) => r.id === id);
    expect(Object.keys(row(ada.userId).cells)).toContain(groupWork);
    expect(Object.keys(row(bo.userId).cells)).not.toContain(groupWork);
    expect(Object.keys(row(bo.userId).cells)).toContain(classWork);
    const report = (await owner.client.get(`/api/classes/${classId}/assignments/${groupWork}/report`)).body;
    expect(report.students.map((s: { id: string }) => s.id)).toEqual([ada.userId]);
    const boReport = (await bo.client.get(`/api/classes/${classId}/students/${bo.userId}/report`)).body;
    expect(boReport.assignments.map((a: { title: string }) => a.title)).not.toContain('Robins reading');
  });

  it('cannot be deleted while work is set for them, and students leave groups when they leave the class', async () => {
    const refused = await owner.client.delete(`/api/classes/${classId}/groups/${groupId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message ?? refused.body.error?.message ?? JSON.stringify(refused.body)).toMatch(/set for this group/);
    expect((await owner.client.patch(`/api/classes/${classId}/assignments/${groupWork}`, { groupId: null })).status).toBe(200);
    expect((await third.client.delete(`/api/classes/${classId}/groups/${groupId}`)).status).toBe(404);
    expect((await ada.client.delete(`/api/classes/${classId}/groups/${groupId}`)).status).toBe(403);
    expect((await co.client.delete(`/api/classes/${classId}/groups/${groupId}`)).status).toBe(200);
    // A new group with Bo, then Bo leaves the class: his place in the group goes too.
    const g2 = (await owner.client.post(`/api/classes/${classId}/groups`, { name: 'Table 2', memberIds: [bo.userId] })).body.group.id;
    expect((await bo.client.delete(`/api/classes/${classId}/members/${bo.userId}`)).status).toBe(200);
    const detail = (await owner.client.get(`/api/classes/${classId}`)).body;
    expect(detail.groups.find((g: { id: string }) => g.id === g2).memberIds).toEqual([]);
  });
});
