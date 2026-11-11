import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { answerEvents, gameParticipants, gameSessions, questionSets, reportNotes, reportSettings, users } from '../src/db/schema.ts';
import { purgeExpiredReports } from '../src/modules/analytics/reports.ts';
import type { Room } from '../src/realtime/room.ts';

/*
 * Report routes: the reports home, a game's analysis, answers download, one player's answers,
 * notes, reteach sets, deleting reports and the retention setting, the download of everything,
 * the term overview, one set and one student across your games. Every route is refused to
 * another teacher and to a student who played, and nothing in a response names an account.
 */

let t: TestContext;
type Account = Awaited<ReturnType<typeof registered>>;
let host: Account;
let otherTeacher: Account;
let student: Account;
let classId: string;
let setId: string;

const QUESTIONS = [
  { id: 'q1', type: 'mcq', prompt: 'Capital of Australia?', choices: [{ id: 'a', text: 'Canberra' }, { id: 'b', text: 'Sydney' }, { id: 'c', text: 'Melbourne' }], correct: 'a' },
  { id: 'q2', type: 'truefalse', prompt: 'Spiders have six legs.', correct: false },
  { id: 'q3', type: 'truefalse', prompt: 'The Sun is a star.', correct: true },
];

beforeAll(async () => {
  t = await createTestApp();
  host = await registered(t.app, { accountType: 'teacher' });
  otherTeacher = await registered(t.app, { accountType: 'teacher' });
  student = await registered(t.app, { accountType: 'student' });
  // A display name that is not the username, so a test can tell which one a response carries.
  await t.db.update(users).set({ displayName: 'Ada Lovelace' }).where(eq(users.id, student.userId));
  const made = await host.client.post('/api/classes', { name: 'Year 6 Ash' });
  classId = made.body.class.id;
  await student.client.post('/api/classes/join', { code: made.body.class.joinCode });
  const [set] = await t.db.insert(questionSets).values({ ownerId: host.userId, title: 'Geography and nature', subject: 'geography', visibility: 'private', questions: QUESTIONS, questionCount: QUESTIONS.length }).returning({ id: questionSets.id });
  setId = set!.id;
});
afterAll(async () => {
  await t?.close();
});

/**
 * A saved game written straight to the database: players by key with their first answers
 * (true = right) and, for wrong ones, the answer given.
 */
async function savedGame(opts: { endedAt?: Date; classId?: string | null; hostId?: string; players: { key: string; name: string; userId?: string | null; guest?: boolean; team?: string; answers: [string, boolean, string?, number?][] }[]; teams?: unknown }) {
  const endedAt = opts.endedAt ?? new Date();
  const [g] = await t.db
    .insert(gameSessions)
    .values({ roomCode: '123456', modeId: 'classic', hostUserId: opts.hostId ?? host.userId, setId, setTitle: 'Geography and nature', settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: opts.players.length, classId: opts.classId ?? null, teams: opts.teams ?? null, startedAt: new Date(endedAt.getTime() - 300_000), endedAt, durationMs: 300_000 })
    .returning({ id: gameSessions.id });
  const gameId = g!.id;
  await t.db.insert(gameParticipants).values(
    opts.players.map((p, i) => ({ gameId, userId: p.userId ?? null, playerKey: p.key, displayName: p.name, isGuest: p.guest ?? !p.userId, isBot: false, teamId: p.team ?? null, rank: i + 1, score: 100 - i, label: `${100 - i} points`, answered: p.answers.length, correct: p.answers.filter((a) => a[1]).length, avgResponseMs: 3000, bestStreak: 1 })),
  );
  const rows = opts.players.flatMap((p) => p.answers.map(([q, correct, given, ms]) => ({ gameId, userId: p.userId ?? null, playerKey: p.key, setId, questionId: q, correct, partial: correct ? 1 : 0, responseMs: ms ?? 4000, kind: 'answer', given: given ?? null })));
  if (rows.length) await t.db.insert(answerEvents).values(rows);
  return gameId;
}

const ACCOUNT_DETAILS = (body: unknown, ...forbidden: string[]) => {
  const text = JSON.stringify(body);
  for (const f of forbidden) expect(text).not.toContain(f);
};

describe('a game report', () => {
  let gameId: string;
  beforeAll(async () => {
    gameId = await savedGame({
      classId: null,
      players: [
        { key: 'p1', name: 'Ada Lovelace', userId: student.userId, answers: [['q1', false, 'Sydney'], ['q2', true], ['q3', true]] },
        { key: 'p2', name: 'Guest Bo', answers: [['q1', false, 'Sydney'], ['q2', false, 'True'], ['q3', true]] },
        { key: 'p3', name: 'Cy', userId: otherTeacher.userId, answers: [['q1', true], ['q2', true], ['q3', true]] },
      ],
    });
  });

  it('says what to teach next: the most common wrong answer, hardest and easiest, and who was a guest', async () => {
    const r = await host.client.get(`/api/games/${gameId}/report`);
    expect(r.status).toBe(200);
    const q1 = r.body.view.questions.find((q: { questionId: string }) => q.questionId === 'q1');
    expect(q1).toMatchObject({ prompt: 'Capital of Australia?', players: 3, right: 1, commonWrong: { text: 'Sydney', count: 2 } });
    expect(r.body.view.misconceptions).toContain('q1');
    expect(r.body.view.hardest).toEqual(['q1']);
    expect(r.body.view.easiest).toEqual(['q3']);
    // Ada is in the host's class (the game was not hosted for it): "your student". Cy is signed in but not.
    expect(r.body.standings.map((s: { membership: string }) => s.membership)).toEqual(['class', 'guest', 'account']);
    // Without the guest: q1 is 1 of 2.
    expect(r.body.viewAccounts.questions.find((q: { questionId: string }) => q.questionId === 'q1')).toMatchObject({ players: 2, right: 1 });
    expect(r.body.can).toEqual({ delete: true, reteach: true });
    ACCOUNT_DETAILS(r.body, student.userId, student.username, otherTeacher.userId, otherTeacher.username);
  });

  it('is refused to another teacher and to a student who played, on every game route', async () => {
    for (const who of [otherTeacher, student]) {
      expect((await who.client.get(`/api/games/${gameId}/report`)).status).toBe(404);
      expect((await who.client.get(`/api/games/${gameId}/answers`)).status).toBe(404);
      expect((await who.client.get(`/api/games/${gameId}/players/p1`)).status).toBe(404);
      expect((await who.client.put(`/api/games/${gameId}/note`, { body: 'mine' })).status).toBe(404);
      expect([403, 404]).toContain((await who.client.post(`/api/games/${gameId}/reteach`, {})).status);
      expect((await who.client.delete(`/api/games/${gameId}/report`)).status).toBe(404);
    }
  });

  it('downloads every answer by display name, and one player answer by answer', async () => {
    const r = await host.client.get(`/api/games/${gameId}/answers`);
    expect(r.status).toBe(200);
    expect(r.body.answers).toHaveLength(9);
    expect(r.body.answers[0]).toMatchObject({ player: 'Ada Lovelace', prompt: 'Capital of Australia?', given: 'Sydney', correct: false, tryNumber: 1 });
    ACCOUNT_DETAILS(r.body, student.userId, student.username);
    const one = await host.client.get(`/api/games/${gameId}/players/p2`);
    expect(one.status).toBe(200);
    expect(one.body.player).toMatchObject({ name: 'Guest Bo', membership: 'guest' });
    expect(one.body.answers.map((a: { correct: boolean }) => a.correct)).toEqual([false, false, true]);
    expect((await host.client.get(`/api/games/${gameId}/players/p9`)).status).toBe(404);
  });

  it('keeps a private note that only its author sees', async () => {
    const saved = await host.client.put(`/api/games/${gameId}/note`, { body: 'Retaught capitals on Tuesday.' });
    expect(saved.status).toBe(200);
    expect((await host.client.get(`/api/games/${gameId}/report`)).body.note.body).toBe('Retaught capitals on Tuesday.');
    expect((await host.client.put(`/api/games/${gameId}/note`, { body: 'x'.repeat(2100) })).status).toBe(400);
    expect((await host.client.put(`/api/games/${gameId}/note`, { body: '  ' })).body.note).toBeNull();
    expect(await t.db.select().from(reportNotes).where(eq(reportNotes.gameId, gameId))).toHaveLength(0);
  });

  it('makes a private reteach set from the most-missed questions, hardest first', async () => {
    const r = await host.client.post(`/api/games/${gameId}/reteach`, { count: 5 });
    expect(r.status).toBe(200);
    const [set] = await t.db.select().from(questionSets).where(eq(questionSets.id, r.body.set.id));
    expect(set).toMatchObject({ ownerId: host.userId, visibility: 'private', questionCount: 2 });
    expect((set!.questions as { prompt: string }[]).map((q) => q.prompt)).toEqual(['Capital of Australia?', 'Spiders have six legs.']);
  });
});

describe('a game played through a room', () => {
  it('saves the words of each wrong answer and the team names for the report', async () => {
    const made = await host.client.post('/api/rooms', { setId, modeId: 'classic', common: { questionLimit: 3, shuffleQuestions: false, teamCount: 2 }, settings: { autoAdvance: false } });
    expect(made.status).toBe(200);
    const r = t.deps.rooms.get(made.body.code) as Room;
    const a = r.join({ name: 'Zia', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    const b = r.join({ name: 'Yan', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    if (!a.ok || !b.ok) throw new Error('join failed');
    expect(r.hostCommand({ cmd: 'start', now: true }).ok).toBe(true);
    for (let i = 0; i < 3; i++) {
      let s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
      if (s.phase !== 'question') r.hostCommand({ cmd: 'next' });
      s = (r.runtime!.debugState() as { sync: { phase: string; iid: string } }).sync;
      if (s.phase !== 'question') break;
      const reveal = r.runtime!.debugReveal(s.iid) as { correct: unknown; choices?: { id: string; text: string }[] };
      const view = r.view(a.player.id) as { game?: { question?: { choices?: { id: string; text: string }[] } } };
      const choices = view.game?.question?.choices ?? [];
      const wrongChoice = choices.find((c) => c.id !== reveal.correct)?.id;
      for (const p of [a, b]) {
        const answer = choices.length ? { type: 'mcq', choiceId: wrongChoice } : { type: 'truefalse', value: !reveal.correct };
        r.action(p.player.id, `a-${p.player.id}-${i}-xxxxxx`, { type: 'answer', iid: s.iid, answer });
      }
      r.hostCommand({ cmd: 'next' });
    }
    if (r.status !== 'ended') r.hostCommand({ cmd: 'end' });
    await t.deps.rooms.idle();
    const [g] = await t.db.select().from(gameSessions).where(eq(gameSessions.roomCode, made.body.code));
    expect(g).toBeTruthy();
    expect((g!.teams as { name: string }[]).length).toBe(2);
    const given = await t.db.select({ given: answerEvents.given }).from(answerEvents).where(eq(answerEvents.gameId, g!.id));
    expect(given.length).toBeGreaterThan(0);
    expect(given.every((x) => typeof x.given === 'string' && x.given.length > 0)).toBe(true);
    const rep = await host.client.get(`/api/games/${g!.id}/report`);
    expect(rep.body.teams).toHaveLength(2);
    expect(rep.body.standings.every((s: { team: string | null }) => s.team)).toBe(true);
    expect(rep.body.view.questions[0].commonWrong).not.toBeNull();
  });
});

describe('the reports home and your report data', () => {
  it('lists only your games, with search, filters, sorting and headline numbers', async () => {
    const mine = await savedGame({ classId, endedAt: new Date('2026-03-03T10:00:00Z'), players: [{ key: 'p1', name: 'Ada', userId: student.userId, answers: [['q1', true], ['q2', false]] }] });
    await savedGame({ hostId: otherTeacher.userId, players: [{ key: 'p1', name: 'Zed', answers: [['q1', true]] }] });
    const all = await host.client.get('/api/reports/games');
    expect(all.status).toBe(200);
    expect(all.body.games.every((g: { setTitle: string }) => g.setTitle === 'Geography and nature')).toBe(true);
    expect(all.body.games.some((g: { players: number; id: string }) => g.id === mine)).toBe(true);
    const inClass = await host.client.get(`/api/reports/games?classId=${classId}`);
    expect(inClass.body.games.map((g: { id: string }) => g.id)).toEqual([mine]);
    expect(inClass.body.games[0]).toMatchObject({ className: 'Year 6 Ash', accuracy: 0.5, questions: 2, players: 1 });
    expect(inClass.body.filters.classes).toEqual([{ id: classId, name: 'Year 6 Ash' }]);
    const dated = await host.client.get('/api/reports/games?from=2026-03-01&to=2026-03-03');
    expect(dated.body.games.map((g: { id: string }) => g.id)).toEqual([mine]);
    expect((await host.client.get('/api/reports/games?q=ash')).body.games.map((g: { id: string }) => g.id)).toEqual([mine]);
    expect((await host.client.get('/api/reports/games?q=Classic')).body.total).toBe(all.body.total);
    expect((await host.client.get('/api/reports/games?q=nothing-like-this')).body.total).toBe(0);
    const oldest = await host.client.get('/api/reports/games?sort=oldest');
    expect(oldest.body.games[0].id).toBe(mine);
    expect((await host.client.get('/api/reports/games?sort=accuracy')).status).toBe(200);
    // Another teacher's list does not show your games.
    expect((await otherTeacher.client.get('/api/reports/games')).body.games.some((g: { id: string }) => g.id === mine)).toBe(false);
  });

  it('gives a term overview of only your games', async () => {
    const r = await host.client.get('/api/reports/overview?from=2026-01-01');
    expect(r.status).toBe(200);
    expect(r.body.totals.games).toBeGreaterThanOrEqual(3);
    expect(r.body.weekly.length).toBeGreaterThan(0);
    expect(r.body.modes[0]).toMatchObject({ modeId: 'classic', mode: 'Classic' });
    expect(r.body.sets[0]).toMatchObject({ setId, title: 'Geography and nature' });
    const other = await otherTeacher.client.get('/api/reports/overview?from=2026-01-01');
    expect(other.body.totals.games).toBe(1);
  });

  it('shows one set across your games, and refuses it to a teacher who never hosted it', async () => {
    const r = await host.client.get(`/api/reports/sets/${setId}`);
    expect(r.status).toBe(200);
    expect(r.body.set).toMatchObject({ id: setId, title: 'Geography and nature', editable: true });
    expect(r.body.questions.find((q: { questionId: string }) => q.questionId === 'q1')).toMatchObject({ prompt: 'Capital of Australia?' });
    expect(r.body.games.length).toBeGreaterThanOrEqual(2);
    expect((await student.client.get(`/api/reports/sets/${setId}`)).status).toBe(404);
  });

  it('shows one student across your games by a key that names no account, only for your own students', async () => {
    const list = await host.client.get('/api/reports/students');
    expect(list.status).toBe(200);
    const ada = list.body.students[0];
    expect(ada.key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(ada).toMatchObject({ name: 'Ada Lovelace', classes: ['Year 6 Ash'] });
    ACCOUNT_DETAILS(list.body, student.userId, student.username);
    const r = await host.client.get(`/api/reports/students/${ada.key}`);
    expect(r.status).toBe(200);
    expect(r.body.games.length).toBeGreaterThanOrEqual(2);
    expect(r.body.bySubject[0].subject).toBe('geography');
    expect(r.body.byType.map((x: { type: string }) => x.type).sort()).toEqual(['mcq', 'truefalse']);
    ACCOUNT_DETAILS(r.body, student.userId, student.username);
    // The same key means nothing to another teacher or to the student.
    expect((await otherTeacher.client.get(`/api/reports/students/${ada.key}`)).status).toBe(404);
    expect((await student.client.get(`/api/reports/students/${ada.key}`)).status).toBe(404);
    expect((await otherTeacher.client.get('/api/reports/students')).body.students).toEqual([]);
  });

  it('downloads everything about your hosted games as JSON, display names only', async () => {
    const r = await host.client.get('/api/reports/export');
    expect(r.status).toBe(200);
    expect(r.res.headers['content-disposition']).toMatch(/ludora-hosted-games/);
    expect(r.body.games.length).toBeGreaterThanOrEqual(3);
    expect(r.body.games.every((g: { players: unknown[] }) => Array.isArray(g.players))).toBe(true);
    ACCOUNT_DETAILS(r.body, student.userId, student.username, host.userId);
    const theirs = await otherTeacher.client.get('/api/reports/export');
    expect(theirs.body.games).toHaveLength(1);
  });

  it('deletes one report (host only), reports older than a date, and enforces a retention setting', async () => {
    const one = await savedGame({ players: [{ key: 'p1', name: 'Ada', answers: [['q1', true]] }] });
    const cls = await savedGame({ classId, players: [{ key: 'p1', name: 'Ada', userId: student.userId, answers: [['q1', true]] }] });
    expect((await otherTeacher.client.delete(`/api/games/${one}/report`)).status).toBe(404);
    expect((await host.client.delete(`/api/games/${one}/report`)).status).toBe(200);
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, one))).toHaveLength(0);
    expect(await t.db.select().from(answerEvents).where(eq(answerEvents.gameId, one))).toHaveLength(0);
    expect((await host.client.get(`/api/games/${cls}/report`)).status).toBe(200);

    const old = await savedGame({ endedAt: new Date('2024-01-10T10:00:00Z'), players: [{ key: 'p1', name: 'Ada', answers: [['q1', true]] }] });
    const theirsOld = await savedGame({ hostId: otherTeacher.userId, endedAt: new Date('2024-01-10T10:00:00Z'), players: [{ key: 'p1', name: 'Zed', answers: [['q1', true]] }] });
    expect((await host.client.post('/api/reports/delete-older', { before: '2099-01-01' })).status).toBe(400);
    const del = await host.client.post('/api/reports/delete-older', { before: '2024-06-01' });
    expect(del.body.deleted).toBe(1);
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, old))).toHaveLength(0);
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, theirsOld))).toHaveLength(1);

    // Retention: 3 months removes the March game at once; the scheduled purge keeps enforcing it.
    expect((await host.client.put('/api/reports/settings', { retentionMonths: 5 })).status).toBe(400);
    const set = await host.client.put('/api/reports/settings', { retentionMonths: 3 });
    expect(set.body).toMatchObject({ retentionMonths: 3 });
    expect(set.body.deleted).toBeGreaterThanOrEqual(1);
    expect((await host.client.get('/api/reports/settings')).body.retentionMonths).toBe(3);
    const later = await savedGame({ endedAt: new Date(Date.now() - 200 * 86_400_000), players: [{ key: 'p1', name: 'Ada', answers: [['q1', true]] }] });
    expect(await purgeExpiredReports(t.db)).toBe(1);
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, later))).toHaveLength(0);
    // The other teacher has no setting, so their old game stays.
    expect(await t.db.select().from(gameSessions).where(eq(gameSessions.id, theirsOld))).toHaveLength(1);
    expect((await t.db.select().from(reportSettings).where(eq(reportSettings.userId, otherTeacher.userId))).length).toBe(0);
    await host.client.put('/api/reports/settings', { retentionMonths: null });
    expect((await t.db.execute(sql`select 1`)).rows.length).toBe(1);
  });

  it('asks a signed-out visitor to sign in', async () => {
    const { Client } = await import('./helpers.ts');
    const anon = new Client(t.app);
    expect((await anon.get('/api/reports/games')).status).toBe(401);
    expect((await anon.get('/api/reports/export')).status).toBe(401);
  });
});

describe('exit ticket and poll answers saved with the game', () => {
  it('shows the class its votes and how it felt, after exit ticket answers arrive late, for the host only', async () => {
    const gameId = await savedGame({ classId: null, players: [{ key: 'p1', name: 'Ada Lovelace', userId: student.userId, answers: [['q1', true]] }] });
    await t.db
      .update(gameSessions)
      .set({ voice: { feelings: { great: 0, okay: 0, tough: 0 }, polls: [{ questionId: 'v1', prompt: 'Which topic next?', choices: [{ id: 'a', text: 'Volcanoes', votes: 3 }, { id: 'b', text: 'Rivers', votes: 1 }] }] } })
      .where(eq(gameSessions.id, gameId));
    // The live room writes exit ticket answers onto the saved game when they come in after it.
    const hooks = (t.deps.rooms as unknown as { hooks: () => { saveFeelings: (id: string, c: Record<string, number>) => Promise<void> } }).hooks();
    await hooks.saveFeelings(gameId, { great: 2, okay: 1, tough: 1 });
    const r = await host.client.get(`/api/games/${gameId}/report`);
    expect(r.status).toBe(200);
    expect(r.body.voice.feelings).toEqual({ great: 2, okay: 1, tough: 1 });
    expect(r.body.voice.polls[0].choices.map((c: { votes: number }) => c.votes)).toEqual([3, 1]);
    expect((await otherTeacher.client.get(`/api/games/${gameId}/report`)).status).toBe(404);
    expect([403, 404]).toContain((await student.client.get(`/api/games/${gameId}/report`)).status);
    // A game saved with no voice at all gets its feelings anyway.
    const bare = await savedGame({ classId: null, players: [{ key: 'p1', name: 'Bo', answers: [['q1', true]] }] });
    await hooks.saveFeelings(bare, { great: 1, okay: 0, tough: 0 });
    expect((await host.client.get(`/api/games/${bare}/report`)).body.voice).toEqual({ feelings: { great: 1, okay: 0, tough: 0 }, polls: [] });
  });
});
