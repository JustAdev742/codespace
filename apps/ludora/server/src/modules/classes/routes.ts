import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getMode, getVariant } from '@ludora/engine';
import { soloBlocker } from '@ludora/engine/catalog';
import { levelFromXp, questionSchema, roomOptionsSchema, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { assignments, classMembers, classes, gameParticipants, gameSessions, questionSets, users } from '../../db/schema.ts';
import { outer } from '../../db/sql.ts';
import { noStore, requireAccount, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { CLEAR_ALPHABET, randomCode } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { isModePlayableBy } from '../modes/service.ts';
import { canView, loadSet } from '../sets/access.ts';
import { questionReport } from '../analytics/report.ts';

/*
 * Classes and assignments. A teacher account creates a class and shares its
 * join code; students join with an account (not as guests, so their work
 * stays theirs). Assignments are played solo, any time before the due
 * date, and the results feed the teacher's report.
 *
 * Privacy: students see their class, their teacher's display name and their
 * own results, never classmates' results. Teachers see their students'
 * display names, usernames and results for their own classes only.
 */

const MAX_CLASSES = 30;
const MAX_MEMBERS = 300;
const MAX_ASSIGNMENTS = 200;
const idParam = z.object({ id: z.string().uuid('No class with that id.') });
const assignmentParams = z.object({ id: z.string().uuid(), aid: z.string().uuid() });
const isoDate = z.iso.datetime({ offset: true });

const assignmentSchema = z.object({
  setId: z.string().uuid(),
  modeId: z.string().min(1).max(60),
  variantId: z.string().min(1).max(60).nullable().default(null),
  title: z.string().trim().min(2).max(80),
  instructions: z.string().trim().max(500).default(''),
  dueAt: isoDate.nullable().default(null),
});

type ClassRow = typeof classes.$inferSelect;

async function newJoinCode(db: DbOrTx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(CLEAR_ALPHABET, 6);
    const [taken] = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code)).limit(1);
    if (!taken) return code;
  }
  throw new Error('Could not allocate a class code');
}

/** The class and the viewer's place in it, or a 404 that says nothing about classes the viewer is not part of. */
async function loadClass(db: DbOrTx, id: string, auth: AuthContext): Promise<{ cls: ClassRow; teacher: boolean; member: boolean }> {
  const [cls] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  if (!cls) throw notFound('That class does not exist.');
  const teacher = cls.ownerId === auth.user.id;
  const [m] = teacher ? [] : await db.select().from(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, auth.user.id))).limit(1);
  if (!teacher && !m) throw notFound('That class does not exist.');
  return { cls, teacher, member: Boolean(m) };
}

function requireTeacherAccount(auth: AuthContext) {
  if (auth.user.accountType !== 'teacher') throw forbidden('Classes are made with a teacher account. You can switch to one in Settings.');
}

/** Solo-playable modes only: assignments are played by each student on their own. */
function assertAssignable(modeId: string, variantId: string | null) {
  const mode = getMode(variantId ? (getVariant(variantId)?.meta.modeId ?? modeId) : modeId);
  if (!mode) throw notFound('That game mode does not exist.');
  // Assignments are played alone, so the mode has to work for one player with no host.
  const blocker = soloBlocker(mode.meta.id, variantId, {});
  if (blocker) throw conflict(`${blocker} Assignments are played alone.`);
  return mode;
}

export async function classRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/classes', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const me = auth.user.id;
    const teaching = await db
      .select({
        c: classes,
        members: sql<number>`(select count(*)::int from ${classMembers} where ${classMembers.classId} = ${outer(classes.id)})`,
        assignmentCount: sql<number>`(select count(*)::int from ${assignments} where ${assignments.classId} = ${outer(classes.id)})`,
      })
      .from(classes)
      .where(eq(classes.ownerId, me))
      .orderBy(desc(classes.createdAt));
    const member = await db
      .select({ c: classes, teacher: users.displayName })
      .from(classMembers)
      .innerJoin(classes, eq(classes.id, classMembers.classId))
      .innerJoin(users, eq(users.id, classes.ownerId))
      .where(and(eq(classMembers.userId, me), isNull(classes.archivedAt)))
      .orderBy(asc(classes.name));
    return {
      canTeach: auth.user.accountType === 'teacher',
      teaching: teaching.map(({ c, members, assignmentCount }) => ({ id: c.id, name: c.name, joinCode: c.joinCode, members, assignments: assignmentCount, archived: Boolean(c.archivedAt), createdAt: c.createdAt.toISOString() })),
      member: member.map(({ c, teacher }) => ({ id: c.id, name: c.name, teacher })),
    };
  });

  app.post('/api/classes', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    requireTeacherAccount(auth);
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
    const [active] = await db.select({ n: count() }).from(classes).where(and(eq(classes.ownerId, auth.user.id), isNull(classes.archivedAt)));
    if ((active?.n ?? 0) >= MAX_CLASSES) throw conflict(`You can have up to ${MAX_CLASSES} active classes. Archive one first.`);
    const [cls] = await db.insert(classes).values({ ownerId: auth.user.id, name, joinCode: await newJoinCode(db) }).returning();
    return { ok: true, class: { id: cls!.id, name: cls!.name, joinCode: cls!.joinCode } };
  });

  app.get('/api/classes/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const { cls, teacher } = await loadClass(db, id, auth);
    const [owner] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, cls.ownerId)).limit(1);
    const tasks = await db
      .select({ a: assignments, setTitle: questionSets.title })
      .from(assignments)
      .leftJoin(questionSets, eq(questionSets.id, assignments.setId))
      .where(eq(assignments.classId, id))
      .orderBy(desc(assignments.createdAt));
    const ids = tasks.map((t) => t.a.id);
    // Each student's best attempt per assignment. Students only ever get their own row back.
    const attempts = ids.length
      ? await db
          .select({
            assignmentId: gameSessions.assignmentId,
            userId: gameParticipants.userId,
            plays: sql<number>`count(*)::int`,
            bestCorrect: sql<number>`max(${gameParticipants.correct})::int`,
            bestAnswered: sql<number>`max(${gameParticipants.answered})::int`,
            last: sql<Date>`max(${gameSessions.endedAt})`,
          })
          .from(gameParticipants)
          .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
          .where(and(inArray(gameSessions.assignmentId, ids), teacher ? sql`true` : eq(gameParticipants.userId, auth.user.id)))
          .groupBy(gameSessions.assignmentId, gameParticipants.userId)
      : [];
    const memberRows = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username, xp: users.xp, lastSeenAt: users.lastSeenAt, joinedAt: classMembers.joinedAt })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(eq(classMembers.classId, id))
      .orderBy(asc(users.displayName));
    const assignmentViews = tasks.map(({ a, setTitle }) => {
      const mine = attempts.filter((x) => x.assignmentId === a.id);
      const me = mine.find((x) => x.userId === auth.user.id);
      return {
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        setId: a.setId,
        setTitle: setTitle ?? 'Deleted set',
        modeId: a.modeId,
        variantId: a.variantId,
        dueAt: a.dueAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        ...(teacher
          ? { started: new Set(mine.map((x) => x.userId)).size, of: memberRows.length }
          : { mine: me ? { plays: me.plays, bestCorrect: me.bestCorrect, bestAnswered: me.bestAnswered, lastPlayedAt: new Date(me.last).toISOString() } : null }),
      };
    });
    return {
      class: { id: cls.id, name: cls.name, teacher: owner?.displayName ?? 'Teacher', archived: Boolean(cls.archivedAt), ...(teacher ? { joinCode: cls.joinCode } : {}) },
      role: teacher ? 'teacher' : 'student',
      memberCount: memberRows.length,
      members: teacher
        ? memberRows.map((m) => ({ id: m.id, displayName: m.displayName, username: m.username, level: levelFromXp(m.xp).level, joinedAt: m.joinedAt.toISOString(), lastSeenAt: m.lastSeenAt?.toISOString() ?? null }))
        : null,
      assignments: assignmentViews,
    };
  });

  app.patch('/api/classes/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), archived: z.boolean().optional() }), req.body);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can change the class.');
    await db
      .update(classes)
      .set({ ...(body.name ? { name: body.name } : {}), ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}) })
      .where(eq(classes.id, id));
    return { ok: true };
  });

  app.post('/api/classes/:id/code', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can change the join code.');
    const joinCode = await newJoinCode(db);
    await db.update(classes).set({ joinCode }).where(eq(classes.id, id));
    return { ok: true, joinCode };
  });

  app.post('/api/classes/join', { config: { rateLimit: { max: 20, timeWindow: '10 minutes', keyGenerator: (r) => (r.auth ? `classjoin:${r.auth.user.id}` : r.ip || 'gone') } } }, async (req) => {
    const auth = requireAccount(req);
    const { code } = parse(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'Class codes are 6 letters and numbers.') }), req.body);
    const [cls] = await db.select().from(classes).where(and(eq(classes.joinCode, code), isNull(classes.archivedAt))).limit(1);
    if (!cls) throw notFound('No class has that code. Check it with your teacher.');
    if (cls.ownerId === auth.user.id) throw conflict('You teach this class.');
    const [n] = await db.select({ n: count() }).from(classMembers).where(eq(classMembers.classId, cls.id));
    if ((n?.n ?? 0) >= MAX_MEMBERS) throw conflict('This class is full. Ask your teacher.');
    const inserted = await db.insert(classMembers).values({ classId: cls.id, userId: auth.user.id }).onConflictDoNothing().returning();
    return { ok: true, class: { id: cls.id, name: cls.name }, alreadyMember: inserted.length === 0 };
  });

  /** The teacher removes a student, or a student leaves. */
  app.delete('/api/classes/:id/members/:userId', async (req) => {
    const auth = requireAccount(req);
    const { id, userId } = parse(z.object({ id: z.string().uuid(), userId: z.string().uuid() }), req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher && userId !== auth.user.id) throw forbidden('Only the teacher can remove other students.');
    await db.delete(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, userId)));
    return { ok: true };
  });

  app.post('/api/classes/:id/assignments', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(assignmentSchema, req.body);
    const { cls, teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can set assignments.');
    if (cls.archivedAt) throw conflict('This class is archived.');
    const set = await loadSet(db, body.setId);
    if (!set || !canView(set, auth)) throw notFound('That question set does not exist or is private to someone else.');
    if (set.hiddenAt) throw conflict('That set has been hidden by moderators.');
    const mode = assertAssignable(body.modeId, body.variantId);
    await isModePlayableBy(deps, auth, mode.meta.id, body.variantId);
    const [n] = await db.select({ n: count() }).from(assignments).where(eq(assignments.classId, id));
    if ((n?.n ?? 0) >= MAX_ASSIGNMENTS) throw conflict('This class has too many assignments. Delete some old ones first.');
    const [a] = await db
      .insert(assignments)
      .values({ classId: id, setId: set.id, modeId: mode.meta.id, variantId: body.variantId, title: body.title, instructions: body.instructions, dueAt: body.dueAt ? new Date(body.dueAt) : null, createdBy: auth.user.id })
      .returning();
    return { ok: true, assignment: { id: a!.id } };
  });

  app.patch('/api/classes/:id/assignments/:aid', async (req) => {
    const auth = requireAccount(req);
    const { id, aid } = parse(assignmentParams, req.params);
    const body = parse(z.object({ title: z.string().trim().min(2).max(80).optional(), instructions: z.string().trim().max(500).optional(), dueAt: isoDate.nullable().optional() }), req.body);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can change assignments.');
    const done = await db
      .update(assignments)
      .set({ ...(body.title ? { title: body.title } : {}), ...(body.instructions !== undefined ? { instructions: body.instructions } : {}), ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}) })
      .where(and(eq(assignments.id, aid), eq(assignments.classId, id)))
      .returning({ id: assignments.id });
    if (!done.length) throw notFound('That assignment does not exist.');
    return { ok: true };
  });

  app.delete('/api/classes/:id/assignments/:aid', async (req) => {
    const auth = requireAccount(req);
    const { id, aid } = parse(assignmentParams, req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can delete assignments.');
    await db.delete(assignments).where(and(eq(assignments.id, aid), eq(assignments.classId, id)));
    return { ok: true };
  });

  /**
   * Start an assignment: a solo room linked to the class and assignment.
   * Students can play a set their teacher keeps private; they see its
   * questions in the game, as with any game, and never the answer list.
   */
  app.post('/api/assignments/:aid/play', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { aid } = parse(z.object({ aid: z.string().uuid() }), req.params);
    const [a] = await db.select().from(assignments).where(eq(assignments.id, aid)).limit(1);
    if (!a) throw notFound('That assignment does not exist.');
    const { cls } = await loadClass(db, a.classId, auth);
    if (cls.archivedAt) throw conflict('This class is archived.');
    const set = await loadSet(db, a.setId);
    if (!set) throw notFound('The question set for this assignment was deleted. Tell your teacher.');
    if (set.hiddenAt) throw conflict('The question set for this assignment is not available right now.');
    const questions: Question[] = [];
    for (const raw of (set.questions as unknown[]) ?? []) {
      const r = questionSchema.safeParse(raw);
      if (r.success) questions.push(r.data);
    }
    assertAssignable(a.modeId, a.variantId);
    let room;
    try {
      room = deps.rooms.create({
        hostUserId: auth.user.id,
        hostName: auth.user.displayName,
        modeId: a.modeId,
        variantId: a.variantId,
        settings: {},
        common: {},
        options: roomOptionsSchema.parse({ maxPlayers: 1, lateJoin: false }),
        set: { id: set.id, title: set.title, questions },
        solo: true,
        classId: a.classId,
        assignmentId: a.id,
      });
    } catch (err) {
      throw new AppError(400, 'validation_failed', (err as Error).message);
    }
    return { code: room.code };
  });

  app.get('/api/classes/:id/assignments/:aid/report', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, aid } = parse(assignmentParams, req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can see the class report.');
    const [a] = await db.select().from(assignments).where(and(eq(assignments.id, aid), eq(assignments.classId, id))).limit(1);
    if (!a) throw notFound('That assignment does not exist.');
    const members = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(eq(classMembers.classId, id))
      .orderBy(asc(users.displayName));
    const games = await db.select({ id: gameSessions.id }).from(gameSessions).where(eq(gameSessions.assignmentId, aid));
    const gameIds = games.map((g) => g.id);
    const rows = gameIds.length
      ? await db
          .select({ userId: gameParticipants.userId, correct: gameParticipants.correct, answered: gameParticipants.answered, score: gameParticipants.score, endedAt: gameSessions.endedAt, avgResponseMs: gameParticipants.avgResponseMs })
          .from(gameParticipants)
          .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
          .where(inArray(gameParticipants.gameId, gameIds))
          .orderBy(asc(gameSessions.endedAt))
      : [];
    const set = await loadSet(db, a.setId);
    const questions = await questionReport(db, gameIds, set);
    const students = members.map((m) => {
      const mine = rows.filter((r) => r.userId === m.id);
      const best = mine.reduce<(typeof mine)[number] | null>((b, r) => (!b || r.correct > b.correct || (r.correct === b.correct && r.score > b.score) ? r : b), null);
      const late = a.dueAt ? mine.length > 0 && mine.every((r) => r.endedAt > a.dueAt!) : false;
      return {
        id: m.id,
        displayName: m.displayName,
        username: m.username,
        attempts: mine.length,
        best: best ? { correct: best.correct, answered: best.answered, score: best.score, accuracy: best.answered ? best.correct / best.answered : null } : null,
        firstPlayedAt: mine[0]?.endedAt.toISOString() ?? null,
        lastPlayedAt: mine[mine.length - 1]?.endedAt.toISOString() ?? null,
        late,
      };
    });
    const started = students.filter((s) => s.attempts > 0);
    return {
      assignment: { id: a.id, title: a.title, modeId: a.modeId, variantId: a.variantId, dueAt: a.dueAt?.toISOString() ?? null, setTitle: set?.title ?? 'Deleted set' },
      summary: {
        students: students.length,
        started: started.length,
        averageAccuracy: started.length ? started.reduce((n, s) => n + (s.best?.accuracy ?? 0), 0) / started.length : null,
      },
      students,
      questions,
    };
  });
}
