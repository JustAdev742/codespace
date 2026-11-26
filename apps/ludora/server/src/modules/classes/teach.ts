import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents, gameSessions, questionSets } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadClass, teacherClass } from './access.ts';
import { hardestIn, latestTries, masteryMap, studentTopics, teachNext, type TopicTry } from './teachNext.ts';
import { isMember, membersOf, saveReteachSet, setQuestions } from './tools.ts';

/*
 * What to teach next (teachNext.ts): a class's map of who knows what, topic by topic, and one
 * step for each topic, for the class's teacher. Counted from the first tries in the class's own
 * games (its assignments and the live games hosted for it). Nothing is stored for it and nothing
 * new is collected.
 *
 * For the class's teacher only: a student in the class gets a 403, everyone else a 404. A student
 * sees their own row, and only theirs, in their own report (tools.ts).
 */

/** The class's most recent games are read; a class that has played more than this is judged on these. */
const MAX_GAMES = 300;
const KEY = '\u0000';

export interface TopicData {
  tries: TopicTry[];
  /** The sets behind each topic, as the viewer may use them. */
  setsOf: (topic: string) => { id: string; title: string; subject: string; ownerId: string | null; visibility: string }[];
  /** A question by its key, when its set is still there to read. */
  questionOf: (key: string) => { setId: string; question: Question } | null;
}

/**
 * First tries by these students in the class's games since a time (or ever), each with the topic
 * its set names. A set moderators have hidden is left out altogether, and so is a self-marked card.
 */
export async function classTopicTries(db: DbOrTx, classId: string, userIds: readonly string[], since: Date | null): Promise<TopicData> {
  const empty: TopicData = { tries: [], setsOf: () => [], questionOf: () => null };
  if (!userIds.length) return empty;
  const games = await db
    .select({ id: gameSessions.id, setId: gameSessions.setId, setTitle: gameSessions.setTitle })
    .from(gameSessions)
    .where(since ? and(eq(gameSessions.classId, classId), gte(gameSessions.endedAt, since)) : eq(gameSessions.classId, classId))
    .orderBy(desc(gameSessions.endedAt))
    .limit(MAX_GAMES);
  if (!games.length) return empty;
  const gameIds = sql.join(games.map((g) => sql`${g.id}::uuid`), sql`, `);
  const who = sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `);
  const res = await db.execute<{ game_id: string; user_id: string; set_id: string | null; question_id: string; correct: boolean; given: string | null; created_at: string }>(sql`
    select distinct on (game_id, player_key, question_id) game_id, user_id, set_id, question_id, correct, given, created_at
    from ${answerEvents}
    where game_id in (${gameIds}) and user_id in (${who}) and kind <> 'self'
    order by game_id, player_key, question_id, id`);
  const gameOf = new Map(games.map((g) => [g.id, g]));
  const setIds = [...new Set([...games.map((g) => g.setId), ...res.rows.map((r) => r.set_id)].filter((x): x is string => Boolean(x)))];
  const rows = setIds.length
    ? await db
        .select({ id: questionSets.id, title: questionSets.title, topic: questionSets.topic, subject: questionSets.subject, ownerId: questionSets.ownerId, visibility: questionSets.visibility, questions: questionSets.questions, hiddenAt: questionSets.hiddenAt, deletedAt: questionSets.deletedAt })
        .from(questionSets)
        .where(inArray(questionSets.id, setIds))
    : [];
  const sets = new Map(rows.map((r) => [r.id, { ...r, byId: setQuestions(r) }]));
  const byTopic = new Map<string, Set<string>>();
  const tries: TopicTry[] = [];
  for (const r of res.rows) {
    const game = gameOf.get(r.game_id);
    if (!game) continue;
    const setId = r.set_id ?? game.setId;
    const set = setId ? sets.get(setId) : undefined;
    if (set?.hiddenAt) continue;
    const topic = (set?.topic?.trim() || set?.title || game.setTitle).trim() || 'Untitled';
    if (set && !set.deletedAt) byTopic.set(topic, (byTopic.get(topic) ?? new Set<string>()).add(set.id));
    tries.push({ userId: r.user_id, topic, question: `${setId ?? ''}${KEY}${r.question_id}`, correct: Boolean(r.correct), at: new Date(r.created_at), given: r.given });
  }
  return {
    tries,
    setsOf: (topic) => [...(byTopic.get(topic) ?? [])].map((id) => sets.get(id)!).map((s) => ({ id: s.id, title: s.title, subject: s.subject, ownerId: s.ownerId, visibility: s.visibility })),
    questionOf: (key) => {
      const [setId, qid] = key.split(KEY) as [string, string];
      const set = setId ? sets.get(setId) : undefined;
      const question = set && !set.hiddenAt && !set.deletedAt ? set.byId.get(qid) : undefined;
      return question ? { setId, question } : null;
    },
  };
}

const idParam = z.object({ id: z.string().uuid('No class with that id.') });
const window = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

export async function classTeachRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** The class's mastery map by topic, and what to teach next. */
  app.get('/api/classes/:id/teach-next', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const q = parse(window, req.query);
    await teacherClass(db, id, auth, 'Only the teacher can see what the class knows.');
    const members = await membersOf(db, id);
    const data = await classTopicTries(db, id, members.map((m) => m.id), new Date(Date.now() - q.days * 86_400_000));
    const map = masteryMap(members, data.tries);
    // A set the viewer can host again: their own, or one anybody can find.
    const usable = (topic: string) => data.setsOf(topic).filter((s) => s.ownerId === auth.user.id || s.visibility === 'public').map((s) => ({ id: s.id, title: s.title }));
    return {
      days: q.days,
      classSize: members.length,
      topics: map.topics.map((t) => ({ ...t, lastAt: t.lastAt?.toISOString() ?? null })),
      students: map.students,
      next: teachNext(members, data.tries).map((s) => ({
        ...s,
        sets: usable(s.topic),
        hardest: s.hardest
          .map((h) => ({ prompt: data.questionOf(h.question)?.question.prompt ?? null, right: h.right, tries: h.tries, commonWrong: h.commonWrong }))
          .filter((h): h is typeof h & { prompt: string } => h.prompt !== null),
      })),
    };
  });

  /** One student's own row of the map: the topics they have played in this class, and how secure each is. For the teacher and for that student. */
  app.get('/api/classes/:id/students/:uid/topics', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, uid } = parse(z.object({ id: z.string().uuid(), uid: z.string().uuid('No student with that id.') }), req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher && uid !== auth.user.id) throw forbidden("Only the teacher can see a classmate's report.");
    if (!(await isMember(db, id, uid))) throw notFound('That student is not in this class.');
    const data = await classTopicTries(db, id, [uid], null);
    return { topics: studentTopics(uid, data.tries) };
  });

  /** Reteach one topic: a new private set in the teacher's library from the questions the class found hardest in it, hardest first. */
  app.post('/api/classes/:id/teach-next/reteach', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ topic: z.string().trim().min(1).max(120), days: window.shape.days, count: z.number().int().min(3).max(30).default(10) }), req.body);
    const cls = await teacherClass(db, id, auth, 'Only the teacher can make a reteach set.');
    if (!auth.permissions.has('sets.create')) throw forbidden('Your account cannot make question sets.');
    const members = await membersOf(db, id);
    const data = await classTopicTries(db, id, members.map((m) => m.id), new Date(Date.now() - body.days * 86_400_000));
    const picked: Question[] = [];
    const subjects = new Map<string, number>();
    for (const h of hardestIn(latestTries(data.tries).filter((t) => t.topic === body.topic), 250)) {
      if (picked.length >= body.count) break;
      const found = data.questionOf(h.question);
      if (!found) continue;
      picked.push({ ...found.question, id: `q${picked.length + 1}` });
      const subject = data.setsOf(body.topic).find((s) => s.id === found.setId)?.subject ?? 'other';
      subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
    }
    if (!picked.length) throw conflict('Nobody has missed a question in that topic, so there is nothing to teach again.');
    const set = await saveReteachSet(db, auth.user.id, {
      title: `Reteach: ${body.topic}`,
      description: `The questions ${cls.name} found hardest in ${body.topic}, hardest first.`,
      subject: [...subjects].sort((a, b) => b[1] - a[1])[0]![0],
      topic: body.topic,
      questions: picked,
    });
    return { ok: true, set };
  });
}
