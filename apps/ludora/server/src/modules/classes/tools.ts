import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { cleanText, containsBlockedLanguage, questionSchema, questionSetInputSchema, SUBJECTS, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents, assignments, classGoalBadges, classGoals, classLogins, classMembers, classNotices, classStudentNotes, classes, gameParticipants, gameSessions, questionSets, users } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { assertUploadsUsable } from '../uploads/service.ts';
import { teachesClass, loadClass, teacherClass, type ClassRow } from './access.ts';
import { groupsOf, leaveGroups, membersFor, myGroups, setForGroups } from './groups.ts';
import { gradeCell, mostMissed, needsAHand, studentStatus, weekOf, type FirstTry } from './insights.ts';

/*
 * The teacher's tools for a class: the gradebook and insights, the mastery
 * grid and attempt comparison, a student's report and private note, reteach
 * sets, notices, the class goal, and moving or removing several students.
 *
 * Every route checks on the server that the caller teaches the class (or, for
 * a student's own report, is that student). Students never see classmates'
 * results; notes are never sent to students at all.
 */

const idParam = z.object({ id: z.string().uuid('No class with that id.') });
const studentParams = z.object({ id: z.string().uuid(), uid: z.string().uuid('No student with that id.') });
const MAX_NOTICES = 50;
const MAX_MEMBERS = 300;
const GOAL_SHOWN_AFTER_END_MS = 3 * 86_400_000;

type GoalRow = typeof classGoals.$inferSelect;
export interface GoalState {
  goal: GoalRow;
  progress: number;
  /** Whether the viewer (a student) has this goal's badge. Null for the teacher. */
  badge: boolean | null;
}

/* ------------------------------------ data ------------------------------------ */

/** Right answers by the class's current members in its assignments between two times. */
async function goalProgress(db: DbOrTx, classId: string, memberIds: readonly string[], from: Date, to: Date): Promise<number> {
  if (!memberIds.length) return 0;
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${gameParticipants.correct}), 0)::int` })
    .from(gameParticipants)
    .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
    .where(and(eq(gameSessions.classId, classId), inArray(gameParticipants.userId, memberIds as string[]), sql`${gameSessions.endedAt} >= ${from}`, sql`${gameSessions.endedAt} < ${to}`));
  return row?.n ?? 0;
}

/**
 * The class's current goal (or one that ended in the last three days, so the class sees how it went),
 * with its progress. The first time progress reaches the target before the end, every member gets the
 * badge, in one transaction. Badges are a mark on the class page: no currency, items or game advantage.
 */
export async function activeGoal(db: DbOrTx, cls: ClassRow, memberIds: readonly string[], viewerId: string | null): Promise<GoalState | null> {
  const [goal] = await db
    .select()
    .from(classGoals)
    .where(and(eq(classGoals.classId, cls.id), gt(classGoals.endsAt, new Date(Date.now() - GOAL_SHOWN_AFTER_END_MS))))
    .orderBy(desc(classGoals.createdAt))
    .limit(1);
  if (!goal) return null;
  const progress = await goalProgress(db, cls.id, memberIds, goal.startsAt, goal.endsAt);
  let current = goal;
  if (!goal.reachedAt && progress >= goal.target && memberIds.length) {
    current = await db.transaction(async (tx) => {
      const [won] = await tx
        .update(classGoals)
        .set({ reachedAt: new Date() })
        .where(and(eq(classGoals.id, goal.id), isNull(classGoals.reachedAt)))
        .returning();
      if (!won) return goal;
      await tx
        .insert(classGoalBadges)
        .values(memberIds.map((userId) => ({ goalId: goal.id, userId })))
        .onConflictDoNothing();
      return won;
    });
  }
  let badge: boolean | null = null;
  if (viewerId) {
    const [b] = await db.select({ g: classGoalBadges.goalId }).from(classGoalBadges).where(and(eq(classGoalBadges.goalId, goal.id), eq(classGoalBadges.userId, viewerId))).limit(1);
    badge = Boolean(b);
  }
  return { goal: current, progress, badge };
}

export function goalView(g: GoalState) {
  return {
    id: g.goal.id,
    title: g.goal.title,
    target: g.goal.target,
    progress: g.progress,
    startsAt: g.goal.startsAt.toISOString(),
    endsAt: g.goal.endsAt.toISOString(),
    reachedAt: g.goal.reachedAt?.toISOString() ?? null,
    badge: g.badge,
  };
}

async function membersOf(db: DbOrTx, classId: string) {
  return db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(users.displayName));
}

async function isMember(db: DbOrTx, classId: string, userId: string) {
  const [m] = await db.select({ u: classMembers.userId }).from(classMembers).where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId))).limit(1);
  return Boolean(m);
}

/** Every finished assignment game in the class, one row per student per game. */
async function classPlays(db: DbOrTx, classId: string, assignmentIds: readonly string[], userIds: readonly string[] | null) {
  if (!assignmentIds.length) return [];
  return db
    .select({
      gameId: gameSessions.id,
      assignmentId: gameSessions.assignmentId,
      setId: gameSessions.setId,
      userId: gameParticipants.userId,
      correct: gameParticipants.correct,
      answered: gameParticipants.answered,
      score: gameParticipants.score,
      durationMs: gameSessions.durationMs,
      endedAt: gameSessions.endedAt,
    })
    .from(gameParticipants)
    .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
    .where(and(eq(gameSessions.classId, classId), inArray(gameSessions.assignmentId, assignmentIds as string[]), userIds ? inArray(gameParticipants.userId, userIds.length ? (userIds as string[]) : ['00000000-0000-0000-0000-000000000000']) : sql`${gameParticipants.userId} is not null`))
    .orderBy(asc(gameSessions.endedAt));
}

/** Each student's first try at each question in each game (retries and self-graded cards left out). */
async function firstTries(db: DbOrTx, gameIds: readonly string[]): Promise<FirstTry[]> {
  if (!gameIds.length) return [];
  const ids = sql.join(gameIds.map((id) => sql`${id}::uuid`), sql`, `);
  const res = await db.execute<{ game_id: string; user_id: string | null; set_id: string | null; question_id: string; correct: boolean; created_at: string }>(sql`
    select distinct on (game_id, player_key, question_id) game_id, user_id, set_id, question_id, correct, created_at
    from ${answerEvents}
    where game_id in (${ids}) and kind <> 'self'
    order by game_id, player_key, question_id, id`);
  return res.rows.filter((r) => r.user_id).map((r) => ({ gameId: r.game_id, userId: r.user_id!, setId: r.set_id, questionId: r.question_id, correct: Boolean(r.correct), at: new Date(r.created_at) }));
}

function setQuestions(set: { questions: unknown } | undefined): Map<string, Question> {
  const out = new Map<string, Question>();
  for (const raw of (set?.questions as unknown[] | undefined) ?? []) {
    const r = questionSchema.safeParse(raw);
    if (r.success) out.set(r.data.id, r.data);
  }
  return out;
}

async function loadSets(db: DbOrTx, ids: readonly (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const rows = unique.length ? await db.select({ id: questionSets.id, title: questionSets.title, subject: questionSets.subject, questions: questionSets.questions, hiddenAt: questionSets.hiddenAt }).from(questionSets).where(inArray(questionSets.id, unique)) : [];
  return new Map(rows.map((r) => [r.id, { ...r, byId: setQuestions(r) }]));
}

/* ----------------------------------- routes ----------------------------------- */

export async function classToolRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Gradebook, time on task, accuracy by question type, students who may need a hand, and the most-missed questions. */
  app.get('/api/classes/:id/insights', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const q = parse(z.object({ threshold: z.coerce.number().min(0.1).max(0.95).default(0.6), days: z.coerce.number().int().min(7).max(120).default(30) }), req.query);
    await teacherClass(db, id, auth, 'Only the teacher can see the gradebook.');
    const tasks = await db.select().from(assignments).where(eq(assignments.classId, id)).orderBy(asc(assignments.createdAt));
    const members = await membersOf(db, id);
    const plays = await classPlays(db, id, tasks.map((t) => t.id), members.map((m) => m.id));
    const tries = await firstTries(db, [...new Set(plays.map((p) => p.gameId))]);
    const sets = await loadSets(db, tasks.map((t) => t.setId));
    const now = new Date();
    // Work for one group has a cell only for that group's students; the rest show it is not theirs.
    const groups = await groupsOf(db, id);
    const everyone = members.map((m) => m.id);
    const setFor = new Map(tasks.map((t) => [t.id, membersFor(t, groups, everyone)]));
    const isFor = (taskId: string, userId: string) => setFor.get(taskId)?.has(userId) ?? false;

    const gradebook = members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      username: m.username,
      cells: Object.fromEntries(tasks.filter((t) => isFor(t.id, m.id)).map((t) => [t.id, gradeCell(plays.filter((p) => p.userId === m.id && p.assignmentId === t.id), t.dueAt)])),
    }));

    const timeOnTask = tasks.map((t) => {
      const mine = plays.filter((p) => p.assignmentId === t.id);
      const perStudent = new Map<string, number>();
      for (const p of mine) perStudent.set(p.userId!, (perStudent.get(p.userId!) ?? 0) + p.durationMs);
      const totals = [...perStudent.values()].sort((a, b) => a - b);
      return {
        assignmentId: t.id,
        totalMs: totals.reduce((n, v) => n + v, 0),
        students: totals.length,
        medianMs: totals.length ? totals[Math.floor((totals.length - 1) / 2)]! : null,
      };
    });

    // Accuracy by question type, from first tries.
    const typeOf = (setId: string | null, qid: string) => (setId ? sets.get(setId)?.byId.get(qid)?.type : undefined) ?? 'unknown';
    const byTypeMap = new Map<string, { right: number; tries: number }>();
    for (const t of tries) {
      const type = typeOf(t.setId, t.questionId);
      const cur = byTypeMap.get(type) ?? { right: 0, tries: 0 };
      cur.tries++;
      if (t.correct) cur.right++;
      byTypeMap.set(type, cur);
    }
    const byType = [...byTypeMap].map(([type, v]) => ({ type, answers: v.tries, rate: v.right / v.tries })).sort((a, b) => a.rate - b.rate);

    const promptOf = (setId: string | null, qid: string) => (setId ? sets.get(setId)?.byId.get(qid)?.prompt : undefined) ?? null;
    const since = new Date(now.getTime() - q.days * 86_400_000);
    const help = needsAHand(
      members,
      tries.filter((t) => t.at >= since),
      q.threshold,
    ).map((h) => ({
      ...h,
      missed: h.missed.map((m) => ({ ...m, prompt: promptOf(m.setId, m.questionId) })).filter((m) => m.prompt !== null).slice(0, 5),
      overdue: tasks.filter((t) => isFor(t.id, h.id) && t.dueAt && t.dueAt < now && !plays.some((p) => p.assignmentId === t.id && p.userId === h.id)).length,
    }));
    // Students who have not started work that is already due, even with no answers to judge.
    const notStarted = members
      .filter((m) => !help.some((h) => h.id === m.id))
      .map((m) => ({ id: m.id, displayName: m.displayName, overdue: tasks.filter((t) => isFor(t.id, m.id) && t.dueAt && t.dueAt < now && !plays.some((p) => p.assignmentId === t.id && p.userId === m.id)).length }))
      .filter((m) => m.overdue > 0);

    const missed = mostMissed(tries)
      .map((m) => ({ ...m, prompt: promptOf(m.setId, m.questionId), type: typeOf(m.setId, m.questionId), setTitle: m.setId ? (sets.get(m.setId)?.title ?? null) : null }))
      .filter((m) => m.prompt !== null)
      .slice(0, 10);

    return {
      assignments: tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, maxAttempts: t.maxAttempts, setTitle: sets.get(t.setId)?.title ?? 'Deleted set', subject: sets.get(t.setId)?.subject ?? null, groupName: t.groupId ? (groups.find((g) => g.id === t.groupId)?.name ?? null) : null })),
      gradebook,
      timeOnTask,
      byType,
      needsAHand: { threshold: q.threshold, days: q.days, students: help, notStarted },
      mostMissed: missed,
    };
  });

  /** Every attempt by every student at one assignment, question by question: the mastery grid and attempt comparison. */
  app.get('/api/classes/:id/assignments/:aid/attempts', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, aid } = parse(z.object({ id: z.string().uuid(), aid: z.string().uuid() }), req.params);
    await teacherClass(db, id, auth, 'Only the teacher can see every attempt.');
    const [a] = await db.select().from(assignments).where(and(eq(assignments.id, aid), eq(assignments.classId, id))).limit(1);
    if (!a) throw notFound('That assignment does not exist.');
    const members = await membersOf(db, id);
    const plays = await classPlays(db, id, [aid], members.map((m) => m.id));
    const tries = await firstTries(db, plays.map((p) => p.gameId));
    const sets = await loadSets(db, [a.setId]);
    const set = sets.get(a.setId);
    const asked = new Set(tries.map((t) => t.questionId));
    // The set's order, keeping only questions someone was asked; questions since removed from the set go last.
    const questions = [
      ...[...(set?.byId.values() ?? [])].filter((qq) => asked.has(qq.id)).map((qq) => ({ id: qq.id, prompt: qq.prompt, type: qq.type })),
      ...[...asked].filter((qid) => !set?.byId.has(qid)).map((qid) => ({ id: qid, prompt: 'A question no longer in the set', type: 'unknown' })),
    ];
    return {
      assignment: { id: a.id, title: a.title, dueAt: a.dueAt?.toISOString() ?? null },
      questions,
      students: members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        attempts: plays
          .filter((p) => p.userId === m.id)
          .map((p) => ({
            gameId: p.gameId,
            endedAt: p.endedAt.toISOString(),
            correct: p.correct,
            answered: p.answered,
            score: p.score,
            durationMs: p.durationMs,
            late: Boolean(a.dueAt && p.endedAt > a.dueAt),
            results: Object.fromEntries(tries.filter((t) => t.gameId === p.gameId && t.userId === m.id).map((t) => [t.questionId, t.correct ? 'right' : 'wrong'])),
          })),
      })),
    };
  });

  /** One student's progress in the class: for the teacher, or for that student (without the teacher's note or username). */
  app.get('/api/classes/:id/students/:uid/report', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, uid } = parse(studentParams, req.params);
    const { cls, teacher } = await loadClass(db, id, auth);
    if (!teacher && uid !== auth.user.id) throw forbidden("Only the teacher can see a classmate's report.");
    if (!(await isMember(db, id, uid))) throw notFound('That student is not in this class.');
    const [student] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, uid)).limit(1);
    const tasks = await db.select().from(assignments).where(eq(assignments.classId, id)).orderBy(asc(assignments.createdAt));
    const now = new Date();
    // Work that has not opened yet is not part of anyone's progress, nor is another group's work.
    const theirGroups = new Set((await myGroups(db, id, uid)).map((g) => g.id));
    const visible = tasks.filter((t) => (!t.opensAt || t.opensAt <= now) && setForGroups(t, theirGroups));
    const plays = await classPlays(db, id, visible.map((t) => t.id), [uid]);
    const tries = await firstTries(db, plays.map((p) => p.gameId));
    const sets = await loadSets(db, visible.map((t) => t.setId));

    const work = visible.map((t) => {
      const mine = plays.filter((p) => p.assignmentId === t.id);
      const cell = gradeCell(mine, t.dueAt);
      const first = mine[0];
      const last = mine[mine.length - 1];
      return {
        id: t.id,
        title: t.title,
        setTitle: sets.get(t.setId)?.title ?? 'Deleted set',
        dueAt: t.dueAt?.toISOString() ?? null,
        ...cell,
        status: studentStatus(cell, t.dueAt, now),
        firstAccuracy: first && first.answered ? first.correct / first.answered : null,
        lastAccuracy: last && last.answered ? last.correct / last.answered : null,
        timeMs: mine.reduce((n, p) => n + p.durationMs, 0),
      };
    });

    const subjectMap = new Map<string, { correct: number; answered: number }>();
    for (const p of plays) {
      const subject = (p.setId && sets.get(p.setId)?.subject) || 'other';
      const cur = subjectMap.get(subject) ?? { correct: 0, answered: 0 };
      cur.correct += p.correct;
      cur.answered += p.answered;
      subjectMap.set(subject, cur);
    }
    const typeMap = new Map<string, { right: number; tries: number }>();
    for (const t of tries) {
      const type = (t.setId && sets.get(t.setId)?.byId.get(t.questionId)?.type) || 'unknown';
      const cur = typeMap.get(type) ?? { right: 0, tries: 0 };
      cur.tries++;
      if (t.correct) cur.right++;
      typeMap.set(type, cur);
    }
    const weekly = new Map<string, { correct: number; answered: number; games: number }>();
    for (const p of plays) {
      const w = weekOf(p.endedAt);
      const cur = weekly.get(w) ?? { correct: 0, answered: 0, games: 0 };
      cur.correct += p.correct;
      cur.answered += p.answered;
      cur.games++;
      weekly.set(w, cur);
    }
    const totals = plays.reduce((n, p) => ({ correct: n.correct + p.correct, answered: n.answered + p.answered }), { correct: 0, answered: 0 });
    const [note] = teacher ? await db.select().from(classStudentNotes).where(and(eq(classStudentNotes.classId, id), eq(classStudentNotes.userId, uid))).limit(1) : [];
    const [owner] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, cls.ownerId)).limit(1);
    return {
      class: { id: cls.id, name: cls.name, teacher: owner?.displayName ?? 'Teacher', schoolName: cls.schoolName },
      student: { id: student!.id, displayName: student!.displayName, ...(teacher ? { username: student!.username } : {}) },
      summary: {
        assignments: visible.length,
        done: work.filter((w) => w.attempts > 0).length,
        late: work.filter((w) => w.late).length,
        accuracy: totals.answered ? totals.correct / totals.answered : null,
        timeMs: plays.reduce((n, p) => n + p.durationMs, 0),
      },
      assignments: work,
      bySubject: [...subjectMap].map(([subject, v]) => ({ subject, correct: v.correct, answered: v.answered, rate: v.answered ? v.correct / v.answered : null })),
      byType: [...typeMap].map(([type, v]) => ({ type, answers: v.tries, rate: v.right / v.tries })).sort((a, b) => a.rate - b.rate),
      weekly: [...weekly].sort(([a], [b]) => a.localeCompare(b)).map(([weekOf, v]) => ({ weekOf, games: v.games, rate: v.answered ? v.correct / v.answered : null })),
      ...(teacher ? { note: note ? { body: note.body, updatedAt: note.updatedAt.toISOString() } : null } : {}),
    };
  });

  /** The teacher's private note on a student. Never sent to students. An empty note deletes it. */
  app.put('/api/classes/:id/students/:uid/note', async (req) => {
    const auth = requireAccount(req);
    const { id, uid } = parse(studentParams, req.params);
    const { body } = parse(z.object({ body: z.string().trim().max(2000, 'Notes can be up to 2,000 characters.') }), req.body);
    await teacherClass(db, id, auth, 'Only the teacher can write notes on students.');
    if (!(await isMember(db, id, uid))) throw notFound('That student is not in this class.');
    if (!body) {
      await db.delete(classStudentNotes).where(and(eq(classStudentNotes.classId, id), eq(classStudentNotes.userId, uid)));
      return { ok: true, note: null };
    }
    const [row] = await db
      .insert(classStudentNotes)
      .values({ classId: id, userId: uid, authorId: auth.user.id, body })
      .onConflictDoUpdate({ target: [classStudentNotes.classId, classStudentNotes.userId], set: { body, authorId: auth.user.id, updatedAt: new Date() } })
      .returning();
    return { ok: true, note: { body: row!.body, updatedAt: row!.updatedAt.toISOString() } };
  });

  /** Reteach: a new private set in the teacher's library from the class's most-missed questions. */
  app.post('/api/classes/:id/reteach', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ assignmentId: z.string().uuid().nullable().default(null), count: z.number().int().min(3).max(30).default(10) }), req.body);
    const cls = await teacherClass(db, id, auth, 'Only the teacher can make a reteach set.');
    if (!auth.permissions.has('sets.create')) throw forbidden('Your account cannot make question sets.');
    const tasks = await db.select().from(assignments).where(body.assignmentId ? and(eq(assignments.classId, id), eq(assignments.id, body.assignmentId)) : eq(assignments.classId, id));
    if (body.assignmentId && !tasks.length) throw notFound('That assignment does not exist.');
    const members = await membersOf(db, id);
    const plays = await classPlays(db, id, tasks.map((t) => t.id), members.map((m) => m.id));
    const tries = await firstTries(db, [...new Set(plays.map((p) => p.gameId))]);
    const sets = await loadSets(db, tasks.map((t) => t.setId));
    const picked: Question[] = [];
    const subjects = new Map<string, number>();
    for (const m of mostMissed(tries)) {
      if (picked.length >= body.count) break;
      const set = m.setId ? sets.get(m.setId) : undefined;
      // Questions from sets moderators have hidden since are not copied.
      const qq = set && !set.hiddenAt ? set.byId.get(m.questionId) : undefined;
      if (!qq) continue;
      picked.push({ ...qq, id: `q${picked.length + 1}` });
      subjects.set(set!.subject, (subjects.get(set!.subject) ?? 0) + 1);
    }
    if (!picked.length) throw conflict('No questions have been missed yet, so there is nothing to reteach. Try again once students have played.');
    const subject = [...subjects].sort((a, b) => b[1] - a[1])[0]![0];
    const input = questionSetInputSchema.safeParse({
      title: `Reteach: ${cls.name}`.slice(0, 80),
      description: `The questions ${cls.name} found hardest${body.assignmentId ? ` in ${tasks[0]!.title}` : ''}, hardest first.`.slice(0, 500),
      subject: (SUBJECTS as readonly string[]).includes(subject) ? subject : 'other',
      visibility: 'private',
      questions: picked,
    });
    if (!input.success) throw conflict('Those questions could not be copied into a new set.');
    await assertUploadsUsable(db, input.data.questions);
    const [owned] = await db.select({ n: count() }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id));
    if ((owned?.n ?? 0) >= 500) throw conflict('You have reached the limit of 500 sets. Delete some you no longer use.');
    const d = input.data;
    const [row] = await db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: d.title, description: d.description, subject: d.subject, language: d.language, tags: d.tags, visibility: 'private', questions: d.questions, questionCount: d.questions.length })
      .returning({ id: questionSets.id, title: questionSets.title });
    return { ok: true, set: { id: row!.id, title: row!.title, questionCount: d.questions.length } };
  });

  /* ---------------------------------- notices ---------------------------------- */

  app.post('/api/classes/:id/notices', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const raw = parse(z.object({ body: z.string().max(400) }), req.body).body;
    const body = cleanText(raw);
    if (body.length < 2) throw new AppError(400, 'validation_failed', 'Write a notice of at least 2 characters.', { body: 'Write at least 2 characters.' });
    if (body.length > 280) throw new AppError(400, 'validation_failed', 'Notices can be up to 280 characters.', { body: 'Use at most 280 characters.' });
    if (containsBlockedLanguage(body)) throw new AppError(400, 'validation_failed', 'That notice has a word Ludora does not allow. Reword it.', { body: 'Reword this: it has a word Ludora does not allow.' });
    await teacherClass(db, id, auth, 'Only the teacher can post notices.', { active: true });
    const [n] = await db.select({ n: count() }).from(classNotices).where(eq(classNotices.classId, id));
    if ((n?.n ?? 0) >= MAX_NOTICES) throw conflict(`A class can have ${MAX_NOTICES} notices. Delete an old one first.`);
    const [row] = await db.insert(classNotices).values({ classId: id, body, createdBy: auth.user.id }).returning();
    return { ok: true, notice: { id: row!.id, body: row!.body, createdAt: row!.createdAt.toISOString() } };
  });

  app.delete('/api/classes/:id/notices/:nid', async (req) => {
    const auth = requireAccount(req);
    const { id, nid } = parse(z.object({ id: z.string().uuid(), nid: z.string().uuid() }), req.params);
    await teacherClass(db, id, auth, 'Only the teacher can remove notices.');
    const gone = await db.delete(classNotices).where(and(eq(classNotices.id, nid), eq(classNotices.classId, id))).returning({ id: classNotices.id });
    if (!gone.length) throw notFound('That notice does not exist.');
    return { ok: true };
  });

  /* ------------------------------------ goal ------------------------------------ */

  app.put('/api/classes/:id/goal', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        title: z.string().max(80).transform(cleanText).pipe(z.string().min(2, 'Give the goal a name of at least 2 characters.').max(60, 'Use at most 60 characters.')),
        target: z.number().int().min(10, 'Aim for at least 10 right answers.').max(100_000, 'Aim for at most 100,000.'),
        endsAt: z.iso.datetime({ offset: true }),
      }),
      req.body,
    );
    if (containsBlockedLanguage(body.title)) throw new AppError(400, 'validation_failed', 'That name has a word Ludora does not allow.', { title: 'Reword this: it has a word Ludora does not allow.' });
    const ends = new Date(body.endsAt);
    const now = new Date();
    if (ends.getTime() <= now.getTime() + 3_600_000) throw new AppError(400, 'validation_failed', 'Give the class at least an hour.', { endsAt: 'Pick an end at least an hour from now.' });
    if (ends.getTime() > now.getTime() + 62 * 86_400_000) throw new AppError(400, 'validation_failed', 'Goals can run for up to two months.', { endsAt: 'Pick an end within two months.' });
    const cls = await teacherClass(db, id, auth, 'Only the teacher can set the class goal.', { active: true });
    // One goal at a time: a new goal ends the current one there and then.
    await db.update(classGoals).set({ endsAt: now }).where(and(eq(classGoals.classId, id), gt(classGoals.endsAt, now)));
    await db.insert(classGoals).values({ classId: cls.id, title: body.title, target: body.target, startsAt: now, endsAt: ends, createdBy: auth.user.id });
    return { ok: true };
  });

  app.delete('/api/classes/:id/goal', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    await teacherClass(db, id, auth, 'Only the teacher can end the class goal.');
    // Badges already earned stay with the students; only goals nobody reached are removed outright.
    const now = new Date();
    await db.delete(classGoals).where(and(eq(classGoals.classId, id), isNull(classGoals.reachedAt), gt(classGoals.endsAt, new Date(now.getTime() - GOAL_SHOWN_AFTER_END_MS))));
    await db.update(classGoals).set({ endsAt: new Date(now.getTime() - GOAL_SHOWN_AFTER_END_MS) }).where(and(eq(classGoals.classId, id), gt(classGoals.endsAt, new Date(now.getTime() - GOAL_SHOWN_AFTER_END_MS))));
    return { ok: true };
  });

  /** Badges the signed-in student has earned from class goals, for their class page. */
  app.get('/api/classes/:id/badges', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    await loadClass(db, id, auth);
    const rows = await db
      .select({ title: classGoals.title, target: classGoals.target, awardedAt: classGoalBadges.awardedAt })
      .from(classGoalBadges)
      .innerJoin(classGoals, eq(classGoals.id, classGoalBadges.goalId))
      .where(and(eq(classGoals.classId, id), eq(classGoalBadges.userId, auth.user.id)))
      .orderBy(desc(classGoalBadges.awardedAt))
      .limit(50);
    return { badges: rows.map((r) => ({ title: r.title, target: r.target, awardedAt: r.awardedAt.toISOString() })) };
  });

  /* ------------------------------- bulk roster actions ------------------------------- */

  app.post('/api/classes/:id/members/bulk', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('remove'), userIds: z.array(z.string().uuid()).min(1, 'Choose at least one student.').max(MAX_MEMBERS) }),
        z.object({ action: z.literal('move'), userIds: z.array(z.string().uuid()).min(1, 'Choose at least one student.').max(MAX_MEMBERS), toClassId: z.string().uuid('Choose a class to move them to.') }),
      ]),
      req.body,
    );
    await teacherClass(db, id, auth, 'Only the teacher can change who is in the class.');
    const userIds = [...new Set(body.userIds)];
    const present = await db.select({ u: classMembers.userId }).from(classMembers).where(and(eq(classMembers.classId, id), inArray(classMembers.userId, userIds)));
    const ids = present.map((p) => p.u);
    if (!ids.length) throw notFound('None of those students are in this class.');
    if (body.action === 'remove') {
      await db.transaction(async (tx) => {
        await tx.delete(classMembers).where(and(eq(classMembers.classId, id), inArray(classMembers.userId, ids)));
        await leaveGroups(tx, id, ids);
        await tx.delete(classStudentNotes).where(and(eq(classStudentNotes.classId, id), inArray(classStudentNotes.userId, ids)));
      });
      return { ok: true, done: ids.length };
    }
    if (body.toClassId === id) throw new AppError(400, 'validation_failed', 'They are already in this class.', { toClassId: 'Choose a different class.' });
    // The class they move to must also be one the caller teaches, and open.
    const [target] = await db.select().from(classes).where(eq(classes.id, body.toClassId)).limit(1);
    if (!target || !(await teachesClass(db, target.id, auth.user.id))) throw notFound('That class does not exist.');
    if (target.archivedAt) throw conflict(`${target.name} is archived. Unarchive it first.`);
    const done = await db.transaction(async (tx) => {
      const [n] = await tx.select({ n: count() }).from(classMembers).where(eq(classMembers.classId, target.id));
      const already = await tx.select({ u: classMembers.userId }).from(classMembers).where(and(eq(classMembers.classId, target.id), inArray(classMembers.userId, ids)));
      if ((n?.n ?? 0) + ids.length - already.length > MAX_MEMBERS) throw conflict(`${target.name} would have more than ${MAX_MEMBERS} students.`);
      await tx.insert(classMembers).values(ids.map((userId) => ({ classId: target.id, userId }))).onConflictDoNothing();
      await tx.delete(classMembers).where(and(eq(classMembers.classId, id), inArray(classMembers.userId, ids)));
      await leaveGroups(tx, id, ids);
      // Notes and class logins follow the student to the new class.
      await tx.delete(classStudentNotes).where(and(eq(classStudentNotes.classId, target.id), inArray(classStudentNotes.userId, ids)));
      await tx.update(classStudentNotes).set({ classId: target.id }).where(and(eq(classStudentNotes.classId, id), inArray(classStudentNotes.userId, ids)));
      await tx.update(classLogins).set({ classId: target.id }).where(and(eq(classLogins.classId, id), inArray(classLogins.userId, ids)));
      return ids.length;
    });
    return { ok: true, done, to: { id: target.id, name: target.name } };
  });
}
