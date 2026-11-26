import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, registered, type TestContext } from './helpers.ts';
import { answerEvents, gameParticipants, gameSessions, questionSets } from '../src/db/schema.ts';
import { ENOUGH_QUESTIONS, hardestIn, heardFrom, latestTries, levelOf, masteryMap, studentTopics, teachNext, type TopicTry } from '../src/modules/classes/teachNext.ts';

/*
 * What to teach next (modules/classes/teachNext.ts and teach.ts): the levels, the map, the order
 * of the steps, and who may ask. The arithmetic first, then the routes against a database.
 */

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 9));
const tri = (userId: string, topic: string, q: string, correct: boolean, at = day(1), given: string | null = null): TopicTry => ({ userId, topic, question: q, correct, at, given });
/** `right` of `n` questions right, as tries q1..qn. */
const run = (userId: string, topic: string, right: number, n: number, at = day(1)) => Array.from({ length: n }, (_, i) => tri(userId, topic, `q${i + 1}`, i < right, at));
const people = (...names: string[]) => names.map((n) => ({ id: n.toLowerCase(), displayName: n }));

describe('levels', () => {
  it('names a level only from enough questions', () => {
    expect(levelOf(0, 0)).toBe('none');
    expect(levelOf(2, 2)).toBe('started');
    expect(ENOUGH_QUESTIONS).toBe(3);
    expect(levelOf(1, 3)).toBe('learning');
    expect(levelOf(2, 4)).toBe('nearly');
    expect(levelOf(3, 4)).toBe('nearly');
    expect(levelOf(4, 5)).toBe('secure');
    expect(levelOf(5, 5)).toBe('secure');
  });

  it("judges a student on their latest try at each question, so growth shows and an old miss stops counting", () => {
    const tries = [tri('ana', 'Fractions', 'q1', false, day(1)), tri('ana', 'Fractions', 'q1', true, day(3)), tri('ana', 'Fractions', 'q2', true, day(1)), tri('ana', 'Fractions', 'q2', false, day(2))];
    const latest = latestTries(tries);
    expect(latest).toHaveLength(2);
    expect(latest.find((t) => t.question === 'q1')!.correct).toBe(true);
    expect(latest.find((t) => t.question === 'q2')!.correct).toBe(false);
  });
});

describe('the map', () => {
  it('has every member against every topic, the topic played most recently first, and leaves out anyone not in the class', () => {
    const members = people('Ana', 'Ben', 'Cal');
    const tries = [...run('ana', 'Fractions', 4, 4, day(2)), ...run('ben', 'Fractions', 1, 4, day(2)), ...run('ana', 'Planets', 2, 2, day(5)), ...run('zed', 'Planets', 0, 4, day(6))];
    const map = masteryMap(members, tries);
    expect(map.topics.map((t) => t.topic)).toEqual(['Planets', 'Fractions']);
    const fractions = map.topics[1]!;
    expect(fractions).toMatchObject({ right: 5, answered: 8, students: 2, levels: { secure: 1, nearly: 0, learning: 1, started: 0, none: 1 } });
    expect(fractions.rate).toBeCloseTo(5 / 8);
    expect(map.students.map((s) => s.cells.map((c) => c.level))).toEqual([
      ['started', 'secure'],
      ['none', 'learning'],
      ['none', 'none'],
    ]);
    // Zed is not in the class: nothing of theirs is counted.
    expect(map.topics[0]).toMatchObject({ answered: 2, students: 1 });
  });

  it("gives one student's own row", () => {
    expect(studentTopics('ana', [...run('ana', 'Fractions', 3, 4), ...run('ben', 'Fractions', 0, 4)])).toEqual([{ topic: 'Fractions', level: 'nearly', right: 3, answered: 4 }]);
  });
});

describe('what to teach next', () => {
  const members = people('Ana', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay');

  it('waits until a third of the class has answered before it judges the class', () => {
    expect(heardFrom(30)).toBe(10);
    expect(heardFrom(6)).toBe(2);
    expect(heardFrom(1)).toBe(1);
    const steps = teachNext(members, run('ana', 'Fractions', 0, 5));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ verdict: 'unseen', topic: 'Fractions', students: 1, of: 6, notYetCount: 5 });
  });

  it('puts the topic to teach again first, then practice, then moving on, then too few to say', () => {
    const tries = [
      // Decimals: 4 of 12 right: teach it again.
      ...run('ana', 'Decimals', 1, 4), ...run('ben', 'Decimals', 1, 4), ...run('cal', 'Decimals', 2, 4),
      // Fractions: 9 of 12: practise once more.
      ...run('ana', 'Fractions', 3, 4), ...run('ben', 'Fractions', 3, 4), ...run('cal', 'Fractions', 3, 4),
      // Planets: 11 of 12, everyone secure: move on.
      ...run('ana', 'Planets', 4, 4), ...run('ben', 'Planets', 4, 4), ...run('cal', 'Planets', 3, 4),
      // Shapes: only Ana has played.
      ...run('ana', 'Shapes', 4, 4),
    ];
    const steps = teachNext(members, tries);
    expect(steps.map((s) => [s.topic, s.verdict])).toEqual([
      ['Decimals', 'reteach'],
      ['Fractions', 'practise'],
      ['Planets', 'moveOn'],
      ['Shapes', 'unseen'],
    ]);
    // Who to sit with: the ones under half, lowest first.
    expect(steps[0]!.group.map((g) => g.displayName)).toEqual(['Ana', 'Ben']);
    expect(steps[0]!.groupSize).toBe(2);
    expect(steps[1]!.notYet.map((m) => m.displayName)).toEqual(['Dee', 'Eve', 'Fay']);
  });

  it('a class that is past a topic can still have a small group to sit with, and that topic comes before one with none', () => {
    const tries = [
      ...run('ana', 'Planets', 4, 4), ...run('ben', 'Planets', 4, 4), ...run('cal', 'Planets', 4, 4),
      ...run('ana', 'Rivers', 5, 5), ...run('ben', 'Rivers', 5, 5), ...run('cal', 'Rivers', 5, 5), ...run('dee', 'Rivers', 5, 5), ...run('eve', 'Rivers', 1, 5),
    ];
    const steps = teachNext(members, tries);
    expect(steps.map((s) => [s.topic, s.verdict, s.groupSize])).toEqual([
      ['Rivers', 'moveOn', 1],
      ['Planets', 'moveOn', 0],
    ]);
    expect(steps[0]!.group).toEqual([{ id: 'eve', displayName: 'Eve', right: 1, answered: 5 }]);
  });

  it('names the hardest questions, and a wrong answer only when at least two gave it', () => {
    const latest = [
      tri('ana', 'Planets', 'q1', false, day(1), 'Venus'), tri('ben', 'Planets', 'q1', false, day(1), 'venus'), tri('cal', 'Planets', 'q1', true),
      tri('ana', 'Planets', 'q2', false, day(1), 'Helium'), tri('ben', 'Planets', 'q2', true), tri('cal', 'Planets', 'q2', true),
      tri('ana', 'Planets', 'q3', true), tri('ben', 'Planets', 'q3', true),
    ];
    expect(hardestIn(latest)).toEqual([
      { question: 'q1', right: 1, tries: 3, commonWrong: { text: 'Venus', count: 2 } },
      { question: 'q2', right: 2, tries: 3, commonWrong: null },
    ]);
  });

  it('never repeats language the name filter stops', () => {
    const hard = hardestIn([tri('ana', 'T', 'q1', false, day(1), 'shit'), tri('ben', 'T', 'q1', false, day(1), 'shit')]);
    expect(hard).toEqual([{ question: 'q1', right: 0, tries: 2, commonWrong: null }]);
  });
});

/* ------------------------------ against a database ------------------------------ */

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t?.close();
});

type Account = Awaited<ReturnType<typeof registered>>;

const tf = (id: string, prompt: string) => ({ id, type: 'truefalse', prompt, correct: true });
const FRACTIONS = [tf('q1', 'A half is the same as two quarters.'), tf('q2', 'A third is bigger than a quarter.'), tf('q3', 'Three thirds make a whole.'), tf('q4', 'A tenth is one of ten equal parts.')];
const PLANETS = [tf('q1', 'Mars is called the red planet.'), tf('q2', 'Jupiter is the largest planet.'), tf('q3', 'Saturn has rings.'), tf('q4', 'Earth has one moon.')];

async function played(opts: { classId: string; setId: string; setTitle: string; userId: string; answers: [string, boolean, string?][]; assignmentId?: string | null; endedAt?: Date }) {
  const endedAt = opts.endedAt ?? new Date();
  const correct = opts.answers.filter(([, c]) => c).length;
  const [g] = await t.db
    .insert(gameSessions)
    .values({ roomCode: '123456', modeId: 'classic', hostUserId: opts.userId, setId: opts.setId, setTitle: opts.setTitle, settings: {}, common: {}, status: 'completed', endedBy: 'mode', playerCount: 1, classId: opts.classId, assignmentId: opts.assignmentId ?? null, isSolo: false, startedAt: new Date(endedAt.getTime() - 90_000), endedAt, durationMs: 90_000 })
    .returning();
  await t.db.insert(gameParticipants).values({ gameId: g!.id, userId: opts.userId, playerKey: 'p0', displayName: 'Player', isGuest: false, isBot: false, rank: 1, score: correct * 100, label: '', answered: opts.answers.length, correct, avgResponseMs: 2000, bestStreak: 1 });
  await t.db.insert(answerEvents).values(opts.answers.map(([questionId, c, given]) => ({ gameId: g!.id, userId: opts.userId, playerKey: 'p0', setId: opts.setId, questionId, correct: c, partial: c ? 1 : 0, responseMs: 1500, given: given ?? null })));
  return g!.id;
}

describe('the routes', () => {
  let teacher: Account;
  let ana: Account;
  let ben: Account;
  let outsider: Account;
  let classId: string;
  let fractions: string;
  let planets: string;

  beforeAll(async () => {
    teacher = await registered(t.app, { accountType: 'teacher' });
    ana = await registered(t.app, { accountType: 'student' });
    ben = await registered(t.app, { accountType: 'student' });
    outsider = await registered(t.app, { accountType: 'student' });
    // One set names its topic; the other is known by its title.
    fractions = (await teacher.client.post('/api/sets', { title: 'Week 3 quiz', topic: 'Fractions', subject: 'math', visibility: 'private', questions: FRACTIONS })).body.set.id;
    planets = (await teacher.client.post('/api/sets', { title: 'The planets', subject: 'science', visibility: 'private', questions: PLANETS })).body.set.id;
    const made = await teacher.client.post('/api/classes', { name: 'Year 5 Oak' });
    classId = made.body.class.id;
    await ana.client.post('/api/classes/join', { code: made.body.class.joinCode });
    await ben.client.post('/api/classes/join', { code: made.body.class.joinCode });
    const earlier = new Date(Date.now() - 3 * 86_400_000);
    // Fractions: a live class game. Both missed q1 with the same answer; Ana also missed q2 and q3.
    await played({ classId, setId: fractions, setTitle: 'Week 3 quiz', userId: ana.userId, endedAt: earlier, answers: [['q1', false, 'False'], ['q2', false, 'False'], ['q3', false, 'False'], ['q4', true]] });
    await played({ classId, setId: fractions, setTitle: 'Week 3 quiz', userId: ben.userId, endedAt: earlier, answers: [['q1', false, 'False'], ['q2', true], ['q3', true], ['q4', true]] });
    // Planets: both right all through.
    await played({ classId, setId: planets, setTitle: 'The planets', userId: ana.userId, answers: [['q1', true], ['q2', true], ['q3', true], ['q4', true]] });
    await played({ classId, setId: planets, setTitle: 'The planets', userId: ben.userId, answers: [['q1', true], ['q2', true], ['q3', true], ['q4', true]] });
    // Somebody who is not in the class played in one of its games: never counted.
    await played({ classId, setId: planets, setTitle: 'The planets', userId: outsider.userId, answers: [['q1', false], ['q2', false], ['q3', false], ['q4', false]] });
  });

  it('gives the teacher the map and the steps, from live games as well as assignments', async () => {
    const res = await teacher.client.get(`/api/classes/${classId}/teach-next`);
    expect(res.status).toBe(200);
    expect(res.body.classSize).toBe(2);
    expect(res.body.topics.map((x: { topic: string }) => x.topic)).toEqual(['The planets', 'Fractions']);
    const next = res.body.next as { verdict: string; topic: string; rate: number; group: { displayName: string }[]; hardest: { prompt: string; right: number; tries: number; commonWrong: { text: string; count: number } | null }[]; sets: { id: string }[] }[];
    expect(next.map((s) => [s.topic, s.verdict])).toEqual([
      ['Fractions', 'reteach'],
      ['The planets', 'moveOn'],
    ]);
    expect(next[0]!.rate).toBeCloseTo(4 / 8);
    const nameOf = (id: string) => (res.body.students as { id: string; displayName: string }[]).find((s) => s.id === id)!.displayName;
    expect(next[0]!.group.map((g) => g.displayName)).toEqual([nameOf(ana.userId)]);
    expect(next[0]!.hardest[0]).toEqual({ prompt: 'A half is the same as two quarters.', right: 0, tries: 2, commonWrong: { text: 'False', count: 2 } });
    expect(next[0]!.sets).toEqual([{ id: fractions, title: 'Week 3 quiz' }]);
    const anaRow = (res.body.students as { id: string; cells: { level: string }[] }[]).find((s) => s.id === ana.userId)!;
    expect(anaRow.cells.map((c) => c.level)).toEqual(['secure', 'learning']);
    // The outsider's four wrong answers did not pull the planets down.
    expect(res.body.topics[0]).toMatchObject({ right: 8, answered: 8, students: 2 });
  });

  it('is for the teacher: a student in the class is refused, and anyone else is told there is no such class', async () => {
    expect((await ana.client.get(`/api/classes/${classId}/teach-next`)).status).toBe(403);
    expect((await outsider.client.get(`/api/classes/${classId}/teach-next`)).status).toBe(404);
    expect((await ana.client.post(`/api/classes/${classId}/teach-next/reteach`, { topic: 'Fractions' })).status).toBe(403);
  });

  it("shows a student their own topics and nobody else's", async () => {
    const mine = await ana.client.get(`/api/classes/${classId}/students/${ana.userId}/topics`);
    expect(mine.status).toBe(200);
    expect(mine.body.topics).toEqual([
      { topic: 'The planets', level: 'secure', right: 4, answered: 4 },
      { topic: 'Fractions', level: 'learning', right: 1, answered: 4 },
    ]);
    expect((await ana.client.get(`/api/classes/${classId}/students/${ben.userId}/topics`)).status).toBe(403);
    expect((await teacher.client.get(`/api/classes/${classId}/students/${ben.userId}/topics`)).status).toBe(200);
    expect((await outsider.client.get(`/api/classes/${classId}/students/${ana.userId}/topics`)).status).toBe(404);
  });

  it('a question got right the next time it comes round counts as known', async () => {
    await played({ classId, setId: fractions, setTitle: 'Week 3 quiz', userId: ana.userId, answers: [['q2', true], ['q3', true]] });
    const mine = await ana.client.get(`/api/classes/${classId}/students/${ana.userId}/topics`);
    expect(mine.body.topics.find((x: { topic: string }) => x.topic === 'Fractions')).toMatchObject({ level: 'nearly', right: 3, answered: 4 });
  });

  it('makes a reteach set of one topic, hardest first, and has nothing to make from a topic nobody missed', async () => {
    const res = await teacher.client.post(`/api/classes/${classId}/teach-next/reteach`, { topic: 'Fractions', count: 5 });
    expect(res.status).toBe(200);
    expect(res.body.set.title).toBe('Reteach: Fractions');
    const [row] = await t.db.select().from(questionSets).where(eq(questionSets.id, res.body.set.id));
    expect(row).toMatchObject({ ownerId: teacher.userId, visibility: 'private', topic: 'Fractions', subject: 'math' });
    // Only what somebody missed on their latest try: q1 (both), nothing from the planets.
    expect((row!.questions as { prompt: string }[]).map((q) => q.prompt)).toEqual(['A half is the same as two quarters.']);
    expect((await teacher.client.post(`/api/classes/${classId}/teach-next/reteach`, { topic: 'The planets' })).status).toBe(409);
  });

  it('leaves out a set moderators have hidden', async () => {
    await t.db.update(questionSets).set({ hiddenAt: new Date(), hiddenReason: 'test' }).where(eq(questionSets.id, planets));
    const res = await teacher.client.get(`/api/classes/${classId}/teach-next`);
    expect(res.body.topics.map((x: { topic: string }) => x.topic)).not.toContain('The planets');
    await t.db.update(questionSets).set({ hiddenAt: null, hiddenReason: null }).where(eq(questionSets.id, planets));
  });
});
