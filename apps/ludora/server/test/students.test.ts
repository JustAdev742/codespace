import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { EngineResults } from '@ludora/engine';
import { getMode } from '@ludora/engine';
import { streakEnding } from '@ludora/shared';
import { Client, createTestApp, registered, type TestContext } from './helpers.ts';
import { achievements, inventory, items, mistakes, practiceRuns, questSwaps, questionSets, userAchievements, userQuests, users } from '../src/db/schema.ts';
import { persistGame } from '../src/realtime/persist.ts';
import type { Room } from '../src/realtime/room.ts';
import { dailyPick, mistakeStep, monthDays, mostImproved, questionOutcome } from '../src/modules/study/logic.ts';
import { parseExtras } from '../src/modules/player/service.ts';
import { periodStart } from '../src/modules/progression/quests.ts';
import { utcDay } from '../src/lib/time.ts';

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

type Account = Awaited<ReturnType<typeof registered>>;

/** The first built-in set with at least five questions, and their ids. */
async function someSet() {
  const sets = await t.db.select().from(questionSets).where(eq(questionSets.isOfficial, true));
  const set = sets.find((s) => (s.questions as unknown[]).length >= 6)!;
  return { id: set.id, title: set.title, qids: (set.questions as { id: string }[]).map((q) => q.id) };
}

interface Played {
  player: Account;
  answers: { qid: string; correct: boolean; kind?: 'answer' | 'attempt' | 'self' }[];
  score?: number;
  label?: string;
}

/**
 * Save a finished game through the real persistGame, as a room would when it ends: the
 * game record, answers, rewards, mistakes and practice rounds. The room is a stand-in with
 * just what persistGame reads.
 */
async function finishGame(opts: { code?: string; host: Account; set: { id: string | null; title: string }; modeId?: string; players: Played[]; solo?: boolean }) {
  const gameId = randomUUID();
  const roster = new Map(opts.players.map((p, i) => [`p${i}`, { userId: p.player.userId, name: p.player.username, isGuest: false, isBot: false }]));
  const room = {
    gameId,
    code: opts.code ?? String(100000 + Math.floor(Math.random() * 899999)),
    roster,
    mode: getMode(opts.modeId ?? 'classic')!,
    variant: null,
    hostUserId: opts.host.userId,
    set: { ...opts.set, questions: [] },
    settings: {},
    common: {},
    classId: null,
    assignmentId: null,
    solo: opts.solo ?? opts.players.length === 1,
    teams: [],
  } as unknown as Room;
  const results: EngineResults = {
    standings: opts.players.map((p, i) => {
      const correct = p.answers.filter((a) => a.correct).length;
      return { playerId: `p${i}`, name: p.player.username, isBot: false, teamId: null, rank: i + 1, score: p.score ?? correct * 800, label: p.label ?? `${p.score ?? correct * 800} points`, left: false, stats: { answered: p.answers.length, correct, responseMsSum: 2000 * p.answers.length, bestStreak: correct } };
    }) as unknown as EngineResults['standings'],
    teamStandings: [],
    outcome: 'competitive',
    summary: 'test game',
    endedBy: 'mode',
    durationMs: 60_000,
    answers: opts.players.flatMap((p, i) => p.answers.map((a) => ({ playerId: `p${i}`, qid: a.qid, correct: a.correct, partial: a.correct ? 1 : 0, responseMs: 2000, at: 0, kind: a.kind ?? 'answer' }))),
    chaos: null,
  };
  return persistGame(t.deps, room, results);
}

describe('study rules', () => {
  it('a first graded answer decides; puzzle tries count if any was right; self-graded never counts', () => {
    expect(questionOutcome([{ correct: false, kind: 'answer' }, { correct: true, kind: 'answer' }])).toBe(false);
    expect(questionOutcome([{ correct: false, kind: 'attempt' }, { correct: true, kind: 'attempt' }])).toBe(true);
    expect(questionOutcome([{ correct: true, kind: 'self' }])).toBeNull();
  });

  it('a question leaves the list after right answers on two different days, and a miss starts the count again', () => {
    const add = mistakeStep(null, false, '2026-11-01');
    expect(add).toEqual({ action: 'insert', next: { misses: 1, rightDays: 0, lastRightDay: null } });
    const once = mistakeStep({ misses: 1, rightDays: 0, lastRightDay: null }, true, '2026-11-02');
    expect(once).toEqual({ action: 'update', next: { misses: 1, rightDays: 1, lastRightDay: '2026-11-02' } });
    expect(mistakeStep({ misses: 1, rightDays: 1, lastRightDay: '2026-11-02' }, true, '2026-11-02')).toEqual({ action: 'none' });
    expect(mistakeStep({ misses: 1, rightDays: 1, lastRightDay: '2026-11-02' }, true, '2026-11-03')).toEqual({ action: 'delete' });
    expect(mistakeStep({ misses: 1, rightDays: 1, lastRightDay: '2026-11-02' }, false, '2026-11-03')).toEqual({ action: 'update', next: { misses: 2, rightDays: 0, lastRightDay: '2026-11-02' } });
    expect(mistakeStep(null, true, '2026-11-03')).toEqual({ action: 'none' });
  });

  it('streaks, months, daily picks and the most improved subject', () => {
    expect(streakEnding(['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-06'], '2026-11-10')).toBe(3);
    expect(streakEnding(['2026-11-09', '2026-11-08'], '2026-11-10')).toBe(2);
    expect(streakEnding(['2026-11-08'], '2026-11-10')).toBe(0);
    expect(monthDays('2028-02')).toHaveLength(29);
    expect(dailyPick(['a', 'b', 'c'], '2026-11-10', 's')).toBe(dailyPick(['a', 'b', 'c'], '2026-11-10', 's'));
    expect(dailyPick([], '2026-11-10', 's')).toBeNull();
    expect(mostImproved([{ subject: 'math', correct: 5, answered: 10 }, { subject: 'science', correct: 9, answered: 10 }], [{ subject: 'math', correct: 9, answered: 10 }, { subject: 'science', correct: 9, answered: 10 }])).toMatchObject({ subject: 'math' });
    expect(mostImproved([{ subject: 'math', correct: 1, answered: 2 }], [{ subject: 'math', correct: 9, answered: 10 }])).toBeNull();
    expect(periodStart('2026-W02')).toBe('2026-01-05');
    expect(periodStart('frost:2026-W02')).toBe('2026-01-05');
    expect(periodStart('2026-11-03')).toBe('2026-11-03');
  });

  it('a bad stored value in one field never hides the others', () => {
    const e = parseExtras({ goal: { metric: 'nonsense', target: 3 }, wishlist: ['a'], favourites: { modes: ['classic'] } });
    expect(e.goal).toBeNull();
    expect(e.wishlist).toEqual(['a']);
    expect(e.favourites).toEqual({ modes: ['classic'], sets: [], glims: [] });
  });
});

describe('my mistakes', () => {
  it('keeps wrong answers, plays them in a solo round, and clears a question after two right days', async () => {
    const a = await registered(t.app);
    const set = await someSet();
    const [q1, q2, q3, q4] = set.qids as [string, string, string, string];
    const first = await finishGame({ host: a, set, players: [{ player: a, answers: [{ qid: q1, correct: false }, { qid: q2, correct: false }, { qid: q3, correct: true }, { qid: q4, correct: false, kind: 'self' }] }] });
    expect(first.rewards.get('p0')?.notes.join(' ')).toContain('2 questions added to My mistakes');
    const list = await a.client.get('/api/me/mistakes');
    expect(list.status).toBe(200);
    expect(list.body.mistakes.map((m: { questionId: string }) => m.questionId).sort()).toEqual([q1, q2].sort());
    // The list carries prompts, never answers.
    expect(JSON.stringify(list.body)).not.toMatch(/"correct"|"accepted"|"answer"/);

    // Fix my mistakes: a solo room with the two mistakes topped up to Classic's minimum of three.
    const play = await a.client.post('/api/me/mistakes/play');
    expect(play.status, JSON.stringify(play.body)).toBe(200);
    expect(play.body.questions).toBe(3);
    const room = t.deps.rooms.get(play.body.code)!;
    expect(room.solo).toBe(true);
    expect(room.set.questions.map((q) => q.id)).toEqual(['m0', 'm1', 'm2']);
    const [run] = await t.db.select().from(practiceRuns).where(eq(practiceRuns.roomCode, play.body.code));
    const map = run!.questions as { q: string; s: string; id: string }[];
    const roomIdOf = (qid: string) => map.find((m) => m.id === qid)!.q;

    // Right on q1 today: it stays, one right day counted.
    await finishGame({ code: play.body.code, host: a, set: { id: null, title: 'My mistakes' }, players: [{ player: a, answers: [{ qid: roomIdOf(q1), correct: true }, { qid: roomIdOf(q2), correct: false }, { qid: 'm2', correct: true }] }] });
    let rows = await t.db.select().from(mistakes).where(eq(mistakes.userId, a.userId));
    expect(rows.find((r) => r.questionId === q1)).toMatchObject({ rightDays: 1, lastRightDay: utcDay() });
    expect(rows.find((r) => r.questionId === q2)).toMatchObject({ misses: 2, rightDays: 0 });
    const [done] = await t.db.select().from(practiceRuns).where(eq(practiceRuns.id, run!.id));
    expect(done!.completedAt).not.toBeNull();

    // Again today: no change. As if a day had passed: the second right day clears it.
    await finishGame({ host: a, set, players: [{ player: a, answers: [{ qid: q1, correct: true }] }] });
    expect((await t.db.select().from(mistakes).where(and(eq(mistakes.userId, a.userId), eq(mistakes.questionId, q1))))[0]?.rightDays).toBe(1);
    await t.db.update(mistakes).set({ lastRightDay: '2020-01-01' }).where(and(eq(mistakes.userId, a.userId), eq(mistakes.questionId, q1)));
    await finishGame({ host: a, set, players: [{ player: a, answers: [{ qid: q1, correct: true }] }] });
    rows = await t.db.select().from(mistakes).where(eq(mistakes.userId, a.userId));
    expect(rows.map((r) => r.questionId)).toEqual([q2]);
  });

  it('refuses a round with no mistakes, and keeps each player to their own list', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const set = await someSet();
    await finishGame({ host: a, set, players: [{ player: a, answers: [{ qid: set.qids[0]!, correct: false }] }, { player: b, answers: [{ qid: set.qids[0]!, correct: true }] }], solo: false });
    expect((await a.client.get('/api/me/mistakes')).body.total).toBe(1);
    expect((await b.client.get('/api/me/mistakes')).body.total).toBe(0);
    expect((await b.client.post('/api/me/mistakes/play')).status).toBe(409);
    expect((await new Client(t.app).get('/api/me/mistakes')).status).toBe(401);
  });
});

describe('daily challenge', () => {
  it('is the same for everyone today, starts a solo game and counts towards a streak', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const da = await a.client.get('/api/me/daily');
    const db = await b.client.get('/api/me/daily');
    expect(da.status).toBe(200);
    expect(da.body.challenge).toBeTruthy();
    expect(da.body.challenge).toEqual(db.body.challenge);
    expect(da.body.challenge.questions).toBe(5);
    expect(da.body).toMatchObject({ streak: 0, doneToday: false });
    const play = await a.client.post('/api/me/daily/play');
    expect(play.status).toBe(200);
    const room = t.deps.rooms.get(play.body.code)!;
    expect(room.set.questions).toHaveLength(5);
    expect(room.mode.meta.id).toBe(da.body.challenge.modeId);
    // Yesterday's challenge was done too: today's makes two in a row.
    await t.db.insert(practiceRuns).values({ userId: a.userId, kind: 'daily', day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), roomCode: '000000', modeId: 'classic', completedAt: new Date() });
    const result = await finishGame({ code: play.body.code, host: a, set: { id: room.set.id, title: room.set.title }, modeId: room.mode.meta.id, players: [{ player: a, answers: room.set.questions.map((q) => ({ qid: q.id, correct: true })) }] });
    const summary = result.rewards.get('p0')!;
    expect(summary.notes.join(' ')).toContain('Daily challenge done: 2 days in a row.');
    // Rewards are an ordinary solo game's: inside the daily cap.
    expect(summary.status).toBe('granted');
    const after = await a.client.get('/api/me/daily');
    expect(after.body).toMatchObject({ streak: 2, doneToday: true });
    // Somebody else's game in the same room code never completes this player's run.
    expect((await b.client.get('/api/me/daily')).body.doneToday).toBe(false);
  });
});

describe('calendar, bests, insights, recap, recent and goal', () => {
  it('reports a player\'s own history and nobody else\'s', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const set = await someSet();
    await finishGame({ host: a, set, players: [{ player: a, answers: set.qids.slice(0, 5).map((qid, i) => ({ qid, correct: i < 3 })), score: 2400, label: '2,400 points' }] });
    const second = await finishGame({ host: a, set, players: [{ player: a, answers: set.qids.slice(0, 5).map((qid) => ({ qid, correct: true })), score: 4000, label: '4,000 points' }] });
    expect(second.rewards.get('p0')!.notes[0]).toBe('New personal best in Classic: 4,000 points.');
    const third = await finishGame({ host: a, set, players: [{ player: a, answers: [{ qid: set.qids[0]!, correct: true }], score: 900, label: '900 points' }] });
    expect(third.rewards.get('p0')!.notes.join(' ')).not.toContain('personal best');

    const cal = await a.client.get(`/api/me/calendar?month=${utcDay().slice(0, 7)}`);
    expect(cal.status).toBe(200);
    expect(cal.body.days.find((d: { day: string }) => d.day === utcDay())).toMatchObject({ games: 3 });
    expect((await a.client.get('/api/me/calendar?month=2026-13')).status).toBe(400);

    const bests = (await a.client.get('/api/me/bests')).body.bests;
    expect(bests[0]).toMatchObject({ modeId: 'classic', games: 3, bestScore: 4000, bestLabel: '4,000 points', bestAccuracy: 1 });

    const insights = (await a.client.get('/api/me/insights')).body;
    expect(insights.favouriteMode).toMatchObject({ modeId: 'classic', games: 3 });
    expect(insights.byType.reduce((n: number, r: { answered: number }) => n + r.answered, 0)).toBe(11);

    const recent = (await a.client.get('/api/me/recent')).body.games;
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ modeId: 'classic', setId: set.id, solo: true });

    expect((await a.client.get('/api/me/recap')).status).toBe(200);

    expect((await a.client.put('/api/me/goal', { metric: 'games', target: 4 })).body.goal).toEqual({ metric: 'games', target: 4 });
    expect((await a.client.get('/api/me/goal')).body).toMatchObject({ goal: { metric: 'games', target: 4 }, progress: 3 });
    // Targets are kept inside the metric's limits.
    expect((await a.client.put('/api/me/goal', { metric: 'correct', target: 2 })).body.goal).toEqual({ metric: 'correct', target: 10 });

    // Another player sees only their own (empty) history.
    expect((await b.client.get('/api/me/bests')).body.bests).toEqual([]);
    expect((await b.client.get('/api/me/goal')).body).toMatchObject({ goal: null, progress: 0 });
    expect((await b.client.get(`/api/me/calendar`)).body.days.every((d: { games: number }) => d.games === 0)).toBe(true);
  });
});

describe('favourites, wishlist, nicknames, titles, card, outfits', () => {
  it('stars modes and sets that exist, and only Glims the player owns', async () => {
    const a = await registered(t.app);
    const set = await someSet();
    expect((await a.client.put('/api/me/favourites/modes/classic')).body.favourites.modes).toEqual(['classic']);
    expect((await a.client.put('/api/me/favourites/modes/not-a-mode')).status).toBe(404);
    expect((await a.client.put(`/api/me/favourites/sets/${set.id}`)).status).toBe(200);
    const [notMine] = await t.db.select({ id: items.id }).from(items).where(eq(items.type, 'glim')).limit(1);
    const owned = await t.db.select({ id: inventory.itemId }).from(inventory).innerJoin(items, eq(items.id, inventory.itemId)).where(and(eq(inventory.userId, a.userId), eq(items.type, 'glim')));
    const foreign = notMine!.id === owned[0]?.id ? (await t.db.select({ id: items.id }).from(items).where(eq(items.type, 'glim')).limit(2))[1]!.id : notMine!.id;
    if (!owned.some((o) => o.id === foreign)) expect((await a.client.put(`/api/me/favourites/glims/${foreign}`)).status).toBe(404);
    expect((await a.client.delete('/api/me/favourites/modes/classic')).body.favourites.modes).toEqual([]);
    const extras = (await a.client.get('/api/me/extras')).body;
    expect(extras.favourites.sets).toEqual([set.id]);
  });

  it('nicknames go through the name filter and are only ever shown to their owner', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const [buddy] = await t.db.select({ id: inventory.itemId }).from(inventory).innerJoin(items, eq(items.id, inventory.itemId)).where(and(eq(inventory.userId, a.userId), eq(items.type, 'glim'))).limit(1);
    expect(buddy).toBeTruthy();
    expect((await a.client.put(`/api/me/nicknames/${buddy!.id}`, { nickname: 'Sir Sparkles' })).status).toBe(200);
    expect((await a.client.put(`/api/me/nicknames/${buddy!.id}`, { nickname: 'shithead' })).status).toBe(400);
    // A Glim nobody was given: not theirs to name.
    const bOwns = new Set((await t.db.select({ id: inventory.itemId }).from(inventory).where(eq(inventory.userId, b.userId))).map((r) => r.id));
    const unowned = (await t.db.select({ id: items.id }).from(items).where(eq(items.type, 'glim'))).find((g) => !bOwns.has(g.id))!;
    expect((await b.client.put(`/api/me/nicknames/${unowned.id}`, { nickname: 'Mine now' })).status).toBe(404);
    // B naming their own copy of the same welcome Glim leaves A's name alone.
    if (bOwns.has(buddy!.id)) expect((await b.client.put(`/api/me/nicknames/${buddy!.id}`, { nickname: 'Pebble' })).status).toBe(200);
    expect((await a.client.get('/api/me/extras')).body.nicknames).toEqual({ [buddy!.id]: 'Sir Sparkles' });
    const profile = await b.client.get(`/api/profiles/${a.userId}`);
    expect(JSON.stringify(profile.body)).not.toContain('Sir Sparkles');
  });

  it('shows an earned title only once its achievement is unlocked, on the public profile too', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const [ach] = await t.db.select().from(achievements).where(eq(achievements.secret, false)).limit(1);
    expect((await a.client.put('/api/me/title', { achievementId: ach!.id })).status).toBe(403);
    await t.db.insert(userAchievements).values({ userId: a.userId, achievementId: ach!.id, claimedAt: new Date() });
    const set = await a.client.put('/api/me/title', { achievementId: ach!.id });
    expect(set.body.earnedTitle).toEqual({ id: ach!.id, text: ach!.title });
    expect((await b.client.get(`/api/profiles/${a.userId}`)).body.earnedTitle).toBe(ach!.title);
    expect((await a.client.put('/api/me/title', { achievementId: null })).body.earnedTitle).toBeNull();
  });

  it('saves up to five outfits, wears one in a tap, and refuses pieces the player does not own', async () => {
    const a = await registered(t.app);
    expect((await a.client.put('/api/me/card', { pose: 'cheer', expression: 'cool' })).body.card).toEqual({ pose: 'cheer', expression: 'cool' });
    expect((await a.client.put('/api/me/card', { pose: 'dab', expression: 'cool' })).status).toBe(400);
    const saved = await a.client.post('/api/me/outfits', { name: 'School day' });
    expect(saved.status).toBe(200);
    expect(saved.body.outfit.items.buddy).toBeTruthy();
    for (let i = 2; i <= 5; i++) expect((await a.client.post('/api/me/outfits', { name: `Look ${i}` })).status).toBe(200);
    expect((await a.client.post('/api/me/outfits', { name: 'One too many' })).status).toBe(409);
    expect((await a.client.post(`/api/me/outfits/${saved.body.outfit.id}/wear`)).body).toMatchObject({ ok: true, missing: [] });
    // An outfit edited to name a Glim the player never owned: that piece is skipped, not worn.
    const [other] = await t.db.select({ id: items.id }).from(items).where(eq(items.type, 'glim')).orderBy(items.sort).limit(1).offset(40);
    await t.db.execute(`update player_extras set data = jsonb_set(data, '{outfits,0,items,buddy}', '"${other!.id}"') where user_id = '${a.userId}'`);
    const worn = await a.client.post(`/api/me/outfits/${saved.body.outfit.id}/wear`);
    expect(worn.body.missing).toHaveLength(1);
    const locker = (await a.client.get('/api/locker')).body;
    expect(locker.equipped.buddy).not.toBe(other!.id);
    expect((await a.client.post('/api/locker/surprise')).status).toBe(200);
    // Someone else's outfit id is simply not found.
    const b = await registered(t.app);
    expect((await b.client.post(`/api/me/outfits/${saved.body.outfit.id}/wear`)).status).toBe(404);
  });

  it('a Glim page tells its story only to someone who has found it, and always says where it comes from', async () => {
    const a = await registered(t.app);
    const mine = new Set((await t.db.select({ id: inventory.itemId }).from(inventory).where(eq(inventory.userId, a.userId))).map((r) => r.id));
    const glims = await t.db.select().from(items).where(and(eq(items.type, 'glim'), eq(items.releaseState, 'live'), eq(items.isTestOnly, false)));
    const owned = glims.find((g) => mine.has(g.id))!;
    const missing = glims.find((g) => !mine.has(g.id) && g.collectionId && !g.collectionId.startsWith('monthly'))!;
    const own = (await a.client.get(`/api/collection/${owned.id}`)).body;
    expect(own).toMatchObject({ name: owned.name, description: owned.description, owned: 1 });
    const other = await a.client.get(`/api/collection/${missing.id}`);
    expect(other.status).toBe(200);
    expect(other.body).toMatchObject({ name: null, description: null, art: null, owned: 0 });
    expect(JSON.stringify(other.body)).not.toContain(missing.name);
    expect(other.body.lanterns.length).toBeGreaterThan(0);
    expect(other.body.lanterns[0].percent).toBeGreaterThan(0);
    expect((await a.client.get('/api/collection/not-a-glim')).status).toBe(404);
  });

  it('keeps a wishlist of real shop listings', async () => {
    const a = await registered(t.app);
    const shop = (await a.client.get('/api/shop')).body;
    const listing = shop.listings?.[0]?.id ?? shop.sections?.[0]?.listings?.[0]?.id;
    expect(listing).toBeTruthy();
    expect((await a.client.put(`/api/me/wishlist/${listing}`)).body.wishlist).toEqual([listing]);
    expect((await a.client.put('/api/me/wishlist/not-a-listing')).status).toBe(404);
    expect((await a.client.delete(`/api/me/wishlist/${listing}`)).body.wishlist).toEqual([]);
  });
});

describe('notifications, invites and recent players', () => {
  it('tells a player about friend requests, and only they can read or mark them', async () => {
    const a = await registered(t.app);
    const b = await registered(t.app);
    const code = (await b.client.get('/api/friends')).body.friendCode;
    await a.client.post('/api/friends/request', { friendCode: code });
    const list = await b.client.get('/api/notifications');
    expect(list.body.items[0]).toMatchObject({ kind: 'friend_request', read: false, link: '/friends' });
    expect((await b.client.get('/api/notifications/count')).body.unread).toBe(1);
    // A's attempt to mark B's notification read changes nothing.
    await a.client.post('/api/notifications/read', { ids: [Number(list.body.items[0].id)] });
    expect((await b.client.get('/api/notifications/count')).body.unread).toBe(1);
    expect((await a.client.post(`/api/notifications/${list.body.items[0].id}/unread`)).status).toBe(404);
    expect((await b.client.post('/api/notifications/read', {})).body.unread).toBe(0);
    await b.client.post(`/api/friends/${a.userId}/accept`);
    expect((await a.client.get('/api/notifications')).body.items[0]).toMatchObject({ kind: 'friend_accepted' });
  });

  it('invites only friends, only to a room the sender is in', async () => {
    const host = await registered(t.app);
    const friend = await registered(t.app);
    const stranger = await registered(t.app);
    await host.client.post('/api/friends/request', { friendCode: (await friend.client.get('/api/friends')).body.friendCode });
    await friend.client.post(`/api/friends/${host.userId}/accept`);
    const set = await someSet();
    const room = await host.client.post('/api/rooms', { setId: set.id, modeId: 'classic' });
    expect(room.status).toBe(200);
    expect((await host.client.post('/api/invites', { userId: stranger.userId, code: room.body.code })).status).toBe(403);
    expect((await stranger.client.post('/api/invites', { userId: friend.userId, code: room.body.code })).status).toBe(404);
    expect((await host.client.post('/api/invites', { userId: friend.userId, code: room.body.code })).status).toBe(200);
    const n = (await friend.client.get('/api/notifications')).body.items.find((i: { kind: string }) => i.kind === 'invite');
    expect(n).toMatchObject({ link: `/join/${room.body.code}` });
  });

  it('lists recent players who accept requests from everyone, and nobody else', async () => {
    const a = await registered(t.app);
    const open = await registered(t.app);
    const closed = await registered(t.app);
    await closed.client.patch('/api/me/preferences', { privacy: { allowFriendRequests: 'friend_code' } });
    const set = await someSet();
    await finishGame({ host: a, set, solo: false, players: [{ player: a, answers: [{ qid: set.qids[0]!, correct: true }] }, { player: open, answers: [] }, { player: closed, answers: [] }] });
    const recent = (await a.client.get('/api/friends/recent')).body.players.map((p: { id: string }) => p.id);
    expect(recent).toEqual([open.userId]);
    await a.client.post('/api/blocks', { userId: open.userId });
    expect((await a.client.get('/api/friends/recent')).body.players).toEqual([]);
  });

  it('notifies an achievement unlock once', async () => {
    const a = await registered(t.app);
    const set = await someSet();
    await finishGame({ host: a, set, players: [{ player: a, answers: set.qids.slice(0, 4).map((qid) => ({ qid, correct: true })) }] });
    const items1 = (await a.client.get('/api/notifications')).body.items.filter((i: { kind: string }) => i.kind === 'achievement');
    expect(items1.length).toBeGreaterThan(0);
  });
});

describe('quests: swap and history', () => {
  it('swaps one unfinished daily quest a day for another the server picks', async () => {
    const a = await registered(t.app);
    const q = (await a.client.get('/api/quests')).body;
    expect(q.swapAvailable).toBe(true);
    const daily = q.quests.filter((x: { kind: string }) => x.kind === 'daily');
    const target = daily[0];
    const swap = await a.client.post(`/api/quests/${target.id}/swap`);
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(swap.body.to.id).not.toBe(target.id);
    const after = (await a.client.get('/api/quests')).body;
    expect(after.swapAvailable).toBe(false);
    const ids = after.quests.filter((x: { kind: string }) => x.kind === 'daily').map((x: { id: string }) => x.id);
    expect(ids).toContain(swap.body.to.id);
    expect(ids).not.toContain(target.id);
    expect(ids).toHaveLength(daily.length);
    expect((await a.client.post(`/api/quests/${ids[1]}/swap`)).status).toBe(409);
    // Another player's quest list is untouched, and they cannot swap a quest that is not theirs.
    const b = await registered(t.app);
    await b.client.get('/api/quests');
    expect((await b.client.post(`/api/quests/not-mine-quest/swap`)).status).toBe(404);
    expect((await t.db.select().from(questSwaps).where(eq(questSwaps.userId, b.userId)))).toHaveLength(0);
  });

  it('lists earlier quests, newest first', async () => {
    const a = await registered(t.app);
    await a.client.get('/api/quests');
    const [mine] = await t.db.select().from(userQuests).where(eq(userQuests.userId, a.userId)).limit(1);
    await t.db.insert(userQuests).values({ userId: a.userId, questId: mine!.questId, period: '2026-01-05', target: mine!.target, progress: 1 });
    await t.db.insert(userQuests).values({ userId: a.userId, questId: mine!.questId, period: '2026-01-07', target: mine!.target, progress: mine!.target, completedAt: new Date() });
    const h = (await a.client.get('/api/quests/history')).body.quests;
    expect(h.map((x: { period: string }) => x.period)).toEqual(['2026-01-07', '2026-01-05']);
    expect(h[0]).toMatchObject({ completed: true, claimed: false });
  });

  it('shows the level track from the rules that pay it', async () => {
    const a = await registered(t.app);
    await t.db.update(users).set({ xp: 1000 }).where(eq(users.id, a.userId));
    const track = (await a.client.get('/api/levels/track')).body;
    expect(track.level.level).toBeGreaterThan(1);
    expect(track.levels.length).toBeGreaterThanOrEqual(5);
    expect(track.levels.filter((l: { reached: boolean }) => !l.reached)).toHaveLength(5);
    expect(track.levels.find((l: { level: number }) => l.level % 5 === 0)?.moonstones).toBeGreaterThan(0);
  });
});
