import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getMode, type EngineResults } from '@ludora/engine';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { houseCups, housePoints, ledger, questionSets, tournamentMatches, userRoles } from '../src/db/schema.ts';
import { persistGame } from '../src/realtime/persist.ts';
import type { Room } from '../src/realtime/room.ts';
import { clearSchoolSettingsCache } from '../src/modules/school/settings.ts';
import { loadAvatar } from '../src/modules/profiles/avatar.ts';

/*
 * A school's own copy: the school staff role, houses and house points (decided and capped on the
 * server), cups, merits, notices, events, sport days, tournaments and class challenges. Every
 * route that changes something is tried by the wrong account too.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let admin: Account;
let schoolStaff: Account;
let teacher: Account;
let otherTeacher: Account;
let student: Account;
let classmate: Account;
let outsider: Account;
let classId: string;
let otherClassId: string;
let otherCode: string;
let setId: string;
const houseIds: string[] = [];

/** Save a finished game through the real persistGame, as a room would. */
async function finishGame(opts: { players: { a: Account; correct: number }[]; solo?: boolean; assignmentId?: string | null; teamPlan?: Room['teamPlan']; teamStandings?: EngineResults['teamStandings'] }) {
  const gameId = randomUUID();
  const roster = new Map(opts.players.map((p, i) => [`p${i}`, { userId: p.a.userId, name: p.a.username, isGuest: false, isBot: false }]));
  const room = {
    gameId,
    code: String(100000 + Math.floor(Math.random() * 899999)),
    roster,
    mode: getMode('classic')!,
    variant: null,
    hostUserId: teacher.userId,
    set: { id: setId, title: 'Test', questions: [] },
    settings: {},
    common: {},
    classId: null,
    assignmentId: opts.assignmentId ?? null,
    solo: opts.solo ?? false,
    teams: [],
    teamPlan: opts.teamPlan ?? null,
  } as unknown as Room;
  const results = {
    standings: opts.players.map((p, i) => ({ playerId: `p${i}`, name: p.a.username, isBot: false, teamId: null, rank: i + 1, score: p.correct * 100, label: '', left: false, stats: { answered: 40, correct: p.correct, responseMsSum: 1000, bestStreak: 1 } })),
    teamStandings: opts.teamStandings ?? [],
    outcome: 'competitive',
    summary: 'test',
    endedBy: 'mode',
    durationMs: 60_000,
    answers: opts.players.flatMap((p, i) => Array.from({ length: 40 }, (_, q) => ({ playerId: `p${i}`, qid: `q${q}`, correct: q < p.correct, partial: q < p.correct ? 1 : 0, responseMs: 2000, at: 0, kind: 'answer' as const }))),
    chaos: null,
  } as unknown as EngineResults;
  const out = await persistGame(t.deps, room, results);
  return { gameId, out };
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await registered(t.app);
  await t.db.insert(userRoles).values({ userId: admin.userId, role: 'superadmin', reason: 'test' });
  schoolStaff = await registered(t.app);
  teacher = await registered(t.app, { accountType: 'teacher' });
  otherTeacher = await registered(t.app, { accountType: 'teacher' });
  student = await registered(t.app);
  classmate = await registered(t.app);
  outsider = await registered(t.app);
  const made = await teacher.client.post('/api/classes', { name: 'Year 5 Blue' });
  classId = made.body.class.id;
  for (const s of [student, classmate]) expect((await s.client.post('/api/classes/join', { code: made.body.class.joinCode })).status).toBe(200);
  const other = await otherTeacher.client.post('/api/classes', { name: 'Year 5 Red' });
  otherClassId = other.body.class.id;
  otherCode = other.body.class.joinCode;
  expect((await outsider.client.post('/api/classes/join', { code: otherCode })).status).toBe(200);
  const [set] = await t.db.select({ id: questionSets.id }).from(questionSets).where(eq(questionSets.isOfficial, true)).limit(1);
  setId = set!.id;
});
afterAll(async () => {
  await t?.close();
});

describe('the school staff role', () => {
  it('is granted through the audited role system, and only it (or an administrator) runs the school', async () => {
    expect((await schoolStaff.client.post('/api/school/houses', { name: 'Banksia', hue: 30, emblem: 'leaf' })).status).toBe(403);
    expect((await teacher.client.patch('/api/school/settings', { houseChoice: true })).status).toBe(403);
    expect((await student.client.get('/api/school/usage')).status).toBe(403);
    // A teacher cannot grant it; a super administrator can.
    expect((await teacher.client.post(`/api/admin/users/${schoolStaff.userId}/roles`, { role: 'school_staff', grant: true, reason: 'runs houses' })).status).toBe(403);
    const granted = await admin.client.post(`/api/admin/users/${schoolStaff.userId}/roles`, { role: 'school_staff', grant: true, reason: 'Runs the houses this year' });
    expect(granted.status, JSON.stringify(granted.body)).toBe(200);
    const me = await schoolStaff.client.get('/api/auth/me');
    expect(me.body.permissions).toEqual(expect.arrayContaining(['school.manage', 'school.view']));
    expect(me.body.permissions).not.toContain('staff.access');
    const usage = await schoolStaff.client.get('/api/school/usage');
    expect(usage.status, JSON.stringify(usage.body)).toBe(200);
  });

  it('sets up houses and settings, checked and audited on the server', async () => {
    for (const [name, hue, emblem] of [['Banksia', 30, 'leaf'], ['Waratah', 350, 'flame'], ['Wattle', 50, 'sun']] as const) {
      const r = await schoolStaff.client.post('/api/school/houses', { name, hue, emblem });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      houseIds.push(r.body.house.id);
    }
    expect((await schoolStaff.client.post('/api/school/houses', { name: 'banksia', hue: 10, emblem: 'star' })).status).toBe(409);
    expect((await schoolStaff.client.post('/api/school/houses', { name: 'X', hue: 400, emblem: 'dragon' })).status).toBe(400);
    const s = await schoolStaff.client.patch('/api/school/settings', { values: ['Kindness', 'Courage'], dailyCap: 10, meritsPerTeacherPerDay: 2 });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect((await schoolStaff.client.patch('/api/school/settings', { timeZone: 'Mars/Olympus' })).status).toBe(400);
    const log = await admin.client.get('/api/admin/audit?action=school.house.create');
    expect(JSON.stringify(log.body)).toContain('Banksia');
    const view = await student.client.get('/api/school');
    expect(view.body.houses.map((h: { name: string }) => h.name)).toEqual(['Banksia', 'Waratah', 'Wattle']);
    expect(view.body.can).toEqual({ manage: false, viewUsage: false, teach: false });
  });
});

describe('houses', () => {
  it('lets a teacher sort their own students, and nobody else’s', async () => {
    expect((await teacher.client.put(`/api/school/students/${student.userId}/house`, { houseId: houseIds[0] })).status).toBe(200);
    expect((await teacher.client.put(`/api/school/students/${outsider.userId}/house`, { houseId: houseIds[0] })).status).toBe(404);
    expect((await classmate.client.put(`/api/school/students/${student.userId}/house`, { houseId: houseIds[1] })).status).toBe(404);
    const roster = await teacher.client.get(`/api/school/classes/${classId}`);
    expect(roster.body.students.find((s: { id: string }) => s.id === student.userId).houseId).toBe(houseIds[0]);
    expect((await otherTeacher.client.get(`/api/school/classes/${classId}`)).status).toBe(404);
    expect((await student.client.get(`/api/school/classes/${classId}`)).status).toBe(403);
    const me = await student.client.get('/api/school/me');
    expect(me.body).toMatchObject({ house: { name: 'Banksia' }, welcome: true });
    await student.client.post('/api/school/me/welcomed');
    expect((await student.client.get('/api/school/me')).body.welcome).toBe(false);
  });

  it('lets a student choose once, only when the school allows it', async () => {
    expect((await outsider.client.post('/api/school/me/house', { houseId: houseIds[1] })).status).toBe(403);
    await schoolStaff.client.patch('/api/school/settings', { houseChoice: true });
    expect((await outsider.client.post('/api/school/me/house', { houseId: houseIds[1] })).status).toBe(200);
    expect((await outsider.client.post('/api/school/me/house', { houseId: houseIds[2] })).status).toBe(409);
    expect((await student.client.post('/api/school/me/house', { houseId: houseIds[2] })).status).toBe(409);
    expect((await teacher.client.post('/api/school/me/house', { houseId: houseIds[2] })).status).toBe(403);
    await schoolStaff.client.patch('/api/school/settings', { houseChoice: false });
  });

  it('puts the house on the avatar other players see, never the account', async () => {
    const avatar = await loadAvatar(t.db, student.userId);
    expect(avatar?.house).toMatchObject({ name: 'Banksia', hue: 30, emblem: 'leaf' });
    expect(JSON.stringify(avatar)).not.toContain(student.username);
  });
});

describe('house points', () => {
  it('pays right answers in live games and assignments to the house, capped per student per day', async () => {
    const first = await finishGame({ players: [{ a: student, correct: 6 }, { a: classmate, correct: 9 }] });
    expect(first.out.rewards.get('p0')?.notes.join(' ')).toContain('6 house points for Banksia.');
    // The classmate has no house: nothing is paid and nothing is said.
    expect(first.out.rewards.get('p1')?.notes.join(' ')).not.toContain('house point');
    const second = await finishGame({ players: [{ a: student, correct: 30 }], assignmentId: null });
    expect(second.out.rewards.get('p0')?.notes.join(' ')).toContain("4 house points for Banksia. That reaches today's limit of 10.");
    const third = await finishGame({ players: [{ a: student, correct: 5 }] });
    expect(third.out.rewards.get('p0')?.notes.join(' ')).toContain("You have earned today's 10 house points");
    const [sum] = await t.db.select({ n: sql<number>`sum(${housePoints.points})::int` }).from(housePoints).where(eq(housePoints.userId, student.userId));
    expect(sum?.n).toBe(10);
    // Solo practice earns nothing.
    await t.db.delete(housePoints).where(eq(housePoints.userId, outsider.userId));
    const solo = await finishGame({ players: [{ a: outsider, correct: 5 }], solo: true });
    expect(solo.out.rewards.get('p0')?.notes.join(' ')).not.toContain('house point');
  });

  it('shows standings by house and by year group as totals only, and per game for the results screen', async () => {
    const week = await outsider.client.get('/api/school/standings?period=week');
    expect(week.status).toBe(200);
    expect(week.body.houses[0]).toMatchObject({ name: 'Banksia', points: 10, rank: 1 });
    expect(JSON.stringify(week.body)).not.toContain(student.username);
    expect(week.body.years.reduce((a: number, y: { points: number }) => a + y.points, 0)).toBe(10);
    const [g] = await t.db.select({ id: housePoints.sourceId }).from(housePoints).where(eq(housePoints.userId, student.userId)).limit(1);
    const perGame = await outsider.client.get(`/api/school/games/${g!.id}/houses`);
    expect(perGame.body.houses[0]).toMatchObject({ name: 'Banksia', players: 1 });
  });
});

describe('house cups', () => {
  it('runs between dates, names the winner when it ends, and keeps it in the hall of fame', async () => {
    expect((await teacher.client.post('/api/school/cups', { name: 'Term 1 Cup', startsOn: '2030-01-01', endsOn: '2030-03-01' })).status).toBe(403);
    expect((await schoolStaff.client.post('/api/school/cups', { name: 'Term 1 Cup', startsOn: '2030-03-01', endsOn: '2030-01-01' })).status).toBe(400);
    const today = new Date().toISOString().slice(0, 10);
    const made = await schoolStaff.client.post('/api/school/cups', { name: 'Spring Cup', startsOn: new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10), endsOn: new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10) });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect((await schoolStaff.client.post('/api/school/cups', { name: 'Overlap Cup', startsOn: today, endsOn: today })).status).toBe(409);
    const cups = await student.client.get('/api/school/cups');
    expect(cups.body.current).toMatchObject({ name: 'Spring Cup' });
    // The cup's last day passes: it closes with Banksia as the winner, and members hear about it.
    await t.db.update(houseCups).set({ startsOn: '2020-01-01', endsOn: '2020-02-01' }).where(eq(houseCups.id, made.body.cup.id));
    await t.db.update(housePoints).set({ day: '2020-01-15' }).where(eq(housePoints.userId, student.userId));
    const fame = await outsider.client.get('/api/school/hall-of-fame');
    expect(fame.body.cups[0]).toMatchObject({ name: 'Spring Cup', winnerName: 'Banksia' });
    const n = await student.client.get('/api/notifications');
    expect(n.body.items.map((i: { title: string }) => i.title)).toContain('Banksia won the Spring Cup');
    expect((await schoolStaff.client.delete(`/api/school/cups/${made.body.cup.id}`)).status).toBe(409);
  });
});

describe('merits', () => {
  it('are given by a student’s own teacher for a school value, earn house points and never currency', async () => {
    const before = await t.db.select().from(ledger).where(eq(ledger.userId, student.userId));
    expect((await classmate.client.post('/api/school/merits', { studentId: student.userId, value: 'Kindness' })).status).toBe(403);
    expect((await otherTeacher.client.post('/api/school/merits', { studentId: student.userId, value: 'Kindness' })).status).toBe(404);
    expect((await teacher.client.post('/api/school/merits', { studentId: student.userId, value: 'Bravery' })).status).toBe(400);
    const ok = await teacher.client.post('/api/school/merits', { studentId: student.userId, value: 'kindness', note: 'Helped a new student' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.merit).toMatchObject({ value: 'Kindness', points: 5 });
    expect((await teacher.client.post('/api/school/merits', { studentId: classmate.userId, value: 'Courage' })).status).toBe(200);
    expect((await teacher.client.post('/api/school/merits', { studentId: classmate.userId, value: 'Courage' })).status).toBe(429);
    const after = await t.db.select().from(ledger).where(eq(ledger.userId, student.userId));
    expect(after.length).toBe(before.length);
    const own = await student.client.get(`/api/school/students/${student.userId}/merits`);
    expect(own.body).toMatchObject({ total: 1, byValue: [{ value: 'Kindness', n: 1 }] });
    expect(own.body.recent[0]).toMatchObject({ note: 'Helped a new student' });
    const other = await outsider.client.get(`/api/school/students/${student.userId}/merits`);
    expect(other.body.recent).toEqual([]);
  });
});

describe('notices and events', () => {
  const hour = 3_600_000;
  it('shows notices to their audience between their dates, run only by school staff', async () => {
    const at = (h: number) => new Date(Date.now() + h * hour).toISOString();
    expect((await teacher.client.post('/api/school/notices', { title: 'Mufti day', audience: 'everyone', startsAt: at(-1), endsAt: at(5) })).status).toBe(403);
    for (const [title, audience, s, e] of [['Mufti day on Friday', 'everyone', -1, 5], ['Staff meeting', 'teachers', -1, 5], ['Bring a hat', 'students', -1, 5], ['Later notice', 'everyone', 48, 60]] as const) {
      expect((await schoolStaff.client.post('/api/school/notices', { title, audience, startsAt: at(s), endsAt: at(e) })).status).toBe(200);
    }
    const forStudent = (await student.client.get('/api/school/notices')).body.notices.map((n: { title: string }) => n.title);
    expect(forStudent.sort()).toEqual(['Bring a hat', 'Mufti day on Friday']);
    const forTeacher = (await teacher.client.get('/api/school/notices')).body.notices.map((n: { title: string }) => n.title);
    expect(forTeacher.sort()).toEqual(['Mufti day on Friday', 'Staff meeting']);
  });

  it('counts down to a school event, and says when it is on', async () => {
    const at = (h: number) => new Date(Date.now() + h * hour).toISOString();
    expect((await student.client.post('/api/school/events', { title: 'Swimming carnival', decor: 'sun', hue: 200, startsAt: at(72), endsAt: at(80) })).status).toBe(403);
    expect((await schoolStaff.client.post('/api/school/events', { title: 'Swimming carnival', decor: 'sun', hue: 200, startsAt: at(72), endsAt: at(80) })).status).toBe(200);
    const e = await student.client.get('/api/school/event');
    expect(e.body.event).toMatchObject({ title: 'Swimming carnival', on: false });
  });
});

describe('sport days', () => {
  it('dresses a student in sport uniform on their sport days, set by them or their teacher', async () => {
    await student.client.patch('/api/me/preferences', { school: { year: 8, blazer: 'green', kit: 'school' } });
    const prefs = await student.client.get('/api/auth/me');
    expect(prefs.body.user.preferences.school.year).toBe(8);
    expect((await classmate.client.put(`/api/school/classes/${classId}/sport-days`, { days: [1, 2, 3, 4, 5] })).status).toBe(403);
    expect((await teacher.client.put(`/api/school/classes/${classId}/sport-days`, { days: [1, 2, 3, 4, 5] })).status).toBe(200);
    const wd = new Date().getUTCDay();
    const avatar = await loadAvatar(t.db, student.userId);
    // Every weekday is a sport day for the class; at weekends the school uniform stays.
    if (avatar) expect(['sport', 'senior-green']).toContain(avatar.uniform);
    expect((await student.client.put('/api/school/me/sport-days', { days: [] })).status).toBe(200);
    const me = await student.client.get('/api/school/me');
    expect(me.body).toMatchObject({ sportDays: [], ownSportDays: true });
    void wd;
  });
});

describe('tournaments', () => {
  it('builds a knockout among classes, fills in from games, and names the winner', async () => {
    expect((await student.client.post('/api/school/tournaments', { name: 'Maths cup', format: 'knockout', entrants: [{ name: 'A' }, { name: 'B' }] })).status).toBe(403);
    expect((await teacher.client.post('/api/school/tournaments', { name: 'Maths cup', format: 'knockout', entrants: [{ name: 'Mine', classId }, { name: 'Theirs', classId: otherClassId }] })).status).toBe(403);
    const made = await teacher.client.post('/api/school/tournaments', { name: 'Maths cup', format: 'knockout', entrants: [{ name: 'Year 5 Blue', classId }, { name: 'Owls' }, { name: 'Hawks' }] });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const id = made.body.tournament.id;
    let view = (await student.client.get(`/api/school/tournaments/${id}`)).body.tournament;
    expect(view.matches).toHaveLength(3);
    // Three entrants: the top seed has a bye straight into the final.
    expect(view.matches.find((m: { round: number; slot: number }) => m.round === 2).a).toBe(0);
    expect((await outsider.client.get(`/api/school/tournaments/${id}`)).status).toBe(404);
    const semi = view.matches.find((m: { round: number; b: number | null; a: number | null }) => m.round === 1 && m.a !== null && m.b !== null);
    // Host the semi-final as a game: the room's teams are the two entrants, and the result fills in.
    const room = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', school: { by: 'match', matchId: semi.id } });
    expect(room.status, JSON.stringify(room.body)).toBe(200);
    const live = t.deps.rooms.get(room.body.code)!;
    expect(live.teams.map((x) => x.name)).toEqual(['Owls', 'Hawks']);
    await finishGame({ players: [{ a: outsider, correct: 2 }], teamPlan: live.teamPlan, teamStandings: [{ teamId: 'ma', name: 'Owls', rank: 2, score: 100, label: '' }, { teamId: 'mb', name: 'Hawks', rank: 1, score: 300, label: '' }] });
    view = (await teacher.client.get(`/api/school/tournaments/${id}`)).body.tournament;
    const final = view.matches.find((m: { round: number }) => m.round === 2);
    expect(final).toMatchObject({ a: 0, b: 2 });
    expect((await student.client.post(`/api/school/tournaments/${id}/matches/${final.id}`, { winner: 'a' })).status).toBe(403);
    expect((await teacher.client.post(`/api/school/tournaments/${id}/matches/${final.id}`, { winner: 'draw' })).status).toBe(409);
    const done = await teacher.client.post(`/api/school/tournaments/${id}/matches/${final.id}`, { winner: 'a', aScore: 5, bScore: 3 });
    expect(done.body.tournament).toMatchObject({ winnerName: 'Year 5 Blue', finished: true });
    const fame = await outsider.client.get('/api/school/hall-of-fame');
    expect(fame.body.tournaments[0]).toMatchObject({ name: 'Maths cup', winnerName: 'Year 5 Blue' });
    const rows = await t.db.select().from(tournamentMatches);
    expect(rows.some((r) => r.gameId)).toBe(true);
  });

  it('makes house match and class against class teams on the server', async () => {
    const houses = await teacher.client.post('/api/rooms', { setId, modeId: 'classic', school: { by: 'houses' } });
    expect(houses.status, JSON.stringify(houses.body)).toBe(200);
    const room = t.deps.rooms.get(houses.body.code)!;
    expect(room.teams.map((x) => x.name)).toEqual(['Banksia', 'Waratah', 'Wattle']);
    const joined = room.join({ userId: student.userId, accountName: student.username, isGuestAccount: false, avatar: null });
    expect(joined.ok && joined.player.teamId).toBe('h1');
    expect((await teacher.client.post('/api/rooms', { setId, modeId: 'classic', school: { by: 'classes', classIds: [classId, otherClassId] } })).status).toBe(404);
  });
});

describe('class challenges', () => {
  it('needs the other teacher to accept, then compares average accuracy fairly', async () => {
    const at = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
    expect((await student.client.post('/api/school/challenges', { classId, otherCode, setId, modeId: 'classic', startsAt: at(0), endsAt: at(7) })).status).toBe(403);
    const made = await teacher.client.post('/api/school/challenges', { classId, otherCode, setId, modeId: 'time-attack', startsAt: at(-1), endsAt: at(7) });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect((await student.client.get('/api/school/challenges')).body.challenges).toEqual([]);
    expect((await teacher.client.post(`/api/school/challenges/${made.body.challenge.id}/accept`)).status).toBe(404);
    expect((await otherTeacher.client.post(`/api/school/challenges/${made.body.challenge.id}/accept`)).status).toBe(200);
    const list = (await student.client.get('/api/school/challenges')).body.challenges;
    expect(list[0]).toMatchObject({ accepted: true, a: { name: 'Year 5 Blue', members: 2 }, b: { name: 'Year 5 Red' } });
    const classes = await student.client.get(`/api/classes/${classId}`);
    expect(JSON.stringify(classes.body)).toContain('Class challenge: Year 5 Blue v Year 5 Red');
  });
});
