import type { FastifyInstance } from 'fastify';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getMode, getVariant, prepareQuestions } from '@ludora/engine';
import { soloBlocker } from '@ludora/engine/catalog';
import { classEventSchema, hasPermission, levelFromXp, questionSchema, roomOptionsSchema, schoolNameSchema, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { assignments, classEvents, classLogins, classMembers, classNotices, classStudentNotes, classes, gameParticipants, gameSessions, moderationActions, questionSets, users } from '../../db/schema.ts';
import { outer } from '../../db/sql.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { CLEAR_ALPHABET, randomCode, recoveryCode } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { isModePlayableBy } from '../modes/service.ts';
import { canView, loadSet } from '../sets/access.ts';
import { questionReport } from '../analytics/report.ts';
import { audit } from '../admin/common.ts';
import { hashSecret, normalizeRecovery, rolesOf } from '../auth/service.ts';
import { loadAvatars } from '../profiles/avatar.ts';
import { assignmentBlocker, loadClass, requireTeacherAccount } from './access.ts';
import { activeGoal, classToolRoutes, goalView } from './tools.ts';
import { classLoginRoutes } from './logins.ts';

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
  opensAt: isoDate.nullable().default(null),
  closesAt: isoDate.nullable().default(null),
  maxAttempts: z.number().int().min(1, 'Allow at least 1 attempt.').max(20, 'Allow at most 20 attempts, or any number.').nullable().default(null),
});

/** Opening after closing, or a due date outside the open window, would confuse students: refuse it with a message on the field. */
function checkWindow(w: { opensAt: string | null; closesAt: string | null; dueAt: string | null }) {
  const t = (v: string | null) => (v ? Date.parse(v) : null);
  const [opens, closes, due] = [t(w.opensAt), t(w.closesAt), t(w.dueAt)];
  if (opens !== null && closes !== null && closes <= opens) throw new AppError(400, 'validation_failed', 'It would close before it opens.', { closesAt: 'Pick a closing time after it opens.' });
  if (due !== null && opens !== null && due <= opens) throw new AppError(400, 'validation_failed', 'It would be due before it opens.', { dueAt: 'Pick a due date after it opens.' });
  if (due !== null && closes !== null && due > closes) throw new AppError(400, 'validation_failed', 'It would close before it is due, so nobody could hand it in on time after closing.', { dueAt: 'Pick a due date on or before it closes.' });
}

async function newJoinCode(db: DbOrTx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(CLEAR_ALPHABET, 6);
    const [taken] = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code)).limit(1);
    if (!taken) return code;
  }
  throw new Error('Could not allocate a class code');
}

const MAX_EVENTS = 30;
const eventParams = z.object({ id: z.string().uuid(), eid: z.string().uuid() });

function eventView(e: typeof classEvents.$inferSelect) {
  return { id: e.id, title: e.title, message: e.message, decor: e.decor, hue: e.hue, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString() };
}

/** Solo-playable modes only: assignments are played by each student on their own. */
function assertAssignable(modeId: string, variantId: string | null) {
  const mode = getMode(variantId ? (getVariant(variantId)?.meta.modeId ?? modeId) : modeId);
  if (!mode) throw notFound('That game mode does not exist.');
  // Assignments are played alone, so the mode has to work for one player, with no host and no teams.
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
      .select({ id: users.id, displayName: users.displayName, username: users.username, xp: users.xp, lastSeenAt: users.lastSeenAt, joinedAt: classMembers.joinedAt, classLogin: classLogins.classId })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .leftJoin(classLogins, eq(classLogins.userId, users.id))
      .where(eq(classMembers.classId, id))
      .orderBy(asc(users.displayName));
    const now = new Date();
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
        opensAt: a.opensAt?.toISOString() ?? null,
        closesAt: a.closesAt?.toISOString() ?? null,
        maxAttempts: a.maxAttempts,
        createdAt: a.createdAt.toISOString(),
        ...(teacher
          ? { started: new Set(mine.map((x) => x.userId)).size, of: memberRows.length }
          : {
              mine: me ? { plays: me.plays, bestCorrect: me.bestCorrect, bestAnswered: me.bestAnswered, lastPlayedAt: new Date(me.last).toISOString() } : null,
              blocked: assignmentBlocker(a, me?.plays ?? 0, now),
            }),
      };
    });
    // Students who are not open yet do not see an assignment until it opens, so a teacher can schedule work ahead.
    const visibleAssignments = teacher ? assignmentViews : assignmentViews.filter((v) => !v.opensAt || Date.parse(v.opensAt) <= now.getTime());
    const notices = await db.select().from(classNotices).where(eq(classNotices.classId, id)).orderBy(desc(classNotices.createdAt)).limit(20);
    const goal = await activeGoal(db, cls, memberRows.map((m) => m.id), teacher ? null : auth.user.id);
    const avatars = teacher ? await loadAvatars(db, memberRows.map((m) => m.id)) : new Map();
    const noted = teacher ? new Set((await db.select({ userId: classStudentNotes.userId }).from(classStudentNotes).where(eq(classStudentNotes.classId, id))).map((r) => r.userId)) : new Set<string>();
    const events = await db
      .select()
      .from(classEvents)
      .where(and(eq(classEvents.classId, id), sql`${classEvents.endsAt} > now()`))
      .orderBy(asc(classEvents.startsAt))
      .limit(30);
    return {
      class: { id: cls.id, name: cls.name, schoolName: cls.schoolName, teacher: owner?.displayName ?? 'Teacher', archived: Boolean(cls.archivedAt), leaderboardOn: cls.leaderboardOn, ...(teacher ? { joinCode: cls.joinCode } : {}) },
      notices: notices.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })),
      goal: goal ? goalView(goal) : null,
      events: events.map(eventView),
      role: teacher ? 'teacher' : 'student',
      memberCount: memberRows.length,
      members: teacher
        ? memberRows.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            username: m.username,
            level: levelFromXp(m.xp).level,
            joinedAt: m.joinedAt.toISOString(),
            lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
            avatar: avatars.get(m.id) ?? null,
            /** Made by this class's teacher with a class login: the teacher resets its passcode. */
            classLogin: m.classLogin === id,
            hasNote: noted.has(m.id),
          }))
        : null,
      assignments: visibleAssignments,
    };
  });

  app.patch('/api/classes/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), archived: z.boolean().optional(), schoolName: schoolNameSchema.optional(), leaderboardOn: z.boolean().optional() }), req.body);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can change the class.');
    await db
      .update(classes)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
        ...(body.schoolName !== undefined ? { schoolName: body.schoolName || null } : {}),
        ...(body.leaderboardOn !== undefined ? { leaderboardOn: body.leaderboardOn } : {}),
      })
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
    await db.transaction(async (tx) => {
      await tx.delete(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, userId)));
      // The teacher's private note goes with the student.
      await tx.delete(classStudentNotes).where(and(eq(classStudentNotes.classId, id), eq(classStudentNotes.userId, userId)));
    });
    return { ok: true };
  });

  /**
   * Sign-in help (D38): the teacher makes a new recovery code for a student who cannot sign in and
   * has lost theirs. The student sets a new password with it on the recovery page, as with their own
   * code. Shown once; the old code stops working; the student is told who made it, and staff can see
   * it in the audit log. Teacher and staff accounts get this help from Ludora support instead.
   */
  app.post('/api/classes/:id/members/:userId/recovery-code', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, userId } = parse(z.object({ id: z.string().uuid(), userId: z.string().uuid() }), req.params);
    const { cls, teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can make recovery codes for students.');
    if (cls.archivedAt) throw conflict('This class is archived. Restore it to help its students.');
    const code = recoveryCode();
    const codeHash = await hashSecret(normalizeRecovery(code));
    const student = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ username: users.username, isGuest: users.isGuest, accountType: users.accountType })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.userId))
        .where(and(eq(classMembers.classId, id), eq(classMembers.userId, userId)))
        .limit(1)
        .for('update', { of: users });
      if (!row) throw notFound('That student is not in this class.');
      if (row.isGuest || !row.username) throw conflict('Guest accounts have no password to recover.');
      if (row.accountType === 'teacher' || hasPermission(await rolesOf(tx, userId), 'staff.access')) throw forbidden('Teacher and staff accounts get sign-in help from Ludora support.');
      // A new code also lifts a lockout from too many wrong passwords.
      await tx.update(users).set({ recoveryCodeHash: codeHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, userId));
      await tx.insert(moderationActions).values({ targetUserId: userId, actorId: auth.user.id, action: 'teacher_recovery_code', reason: `${auth.user.displayName} (${cls.name})` });
      // The code itself is never written to the audit log.
      await audit(deps, req, tx, { actor: auth, action: 'class.recovery_code', targetType: 'user', targetId: userId, targetName: row.username, reason: `Teacher of ${cls.name}` });
      return row;
    });
    return { ok: true, recoveryCode: code, username: student.username };
  });

  app.post('/api/classes/:id/assignments', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(assignmentSchema, req.body);
    checkWindow(body);
    const { cls, teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can set assignments.');
    if (cls.archivedAt) throw conflict('This class is archived.');
    const set = await loadSet(db, body.setId);
    if (!set || !canView(set, auth)) throw notFound('That question set does not exist or is private to someone else.');
    if (set.hiddenAt) throw conflict('That set has been hidden by moderators.');
    const mode = assertAssignable(body.modeId, body.variantId);
    await isModePlayableBy(deps, auth, mode.meta.id, body.variantId);
    // Refuse now an assignment no student could ever start: too few questions this mode can show.
    const playable = ((set.questions as unknown[]) ?? []).flatMap((raw) => {
      const r = questionSchema.safeParse(raw);
      return r.success ? [r.data] : [];
    });
    const { problem } = prepareQuestions(mode, playable, 0);
    if (problem) throw conflict(`${problem} Choose another set or game mode.`);
    const [n] = await db.select({ n: count() }).from(assignments).where(eq(assignments.classId, id));
    if ((n?.n ?? 0) >= MAX_ASSIGNMENTS) throw conflict('This class has too many assignments. Delete some old ones first.');
    const [a] = await db
      .insert(assignments)
      .values({ classId: id, setId: set.id, modeId: mode.meta.id, variantId: body.variantId, title: body.title, instructions: body.instructions, dueAt: body.dueAt ? new Date(body.dueAt) : null, opensAt: body.opensAt ? new Date(body.opensAt) : null, closesAt: body.closesAt ? new Date(body.closesAt) : null, maxAttempts: body.maxAttempts, createdBy: auth.user.id })
      .returning();
    return { ok: true, assignment: { id: a!.id } };
  });

  app.patch('/api/classes/:id/assignments/:aid', async (req) => {
    const auth = requireAccount(req);
    const { id, aid } = parse(assignmentParams, req.params);
    const body = parse(
      z.object({
        title: z.string().trim().min(2).max(80).optional(),
        instructions: z.string().trim().max(500).optional(),
        dueAt: isoDate.nullable().optional(),
        opensAt: isoDate.nullable().optional(),
        closesAt: isoDate.nullable().optional(),
        maxAttempts: assignmentSchema.shape.maxAttempts.removeDefault().optional(),
      }),
      req.body,
    );
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can change assignments.');
    const [current] = await db.select().from(assignments).where(and(eq(assignments.id, aid), eq(assignments.classId, id))).limit(1);
    if (!current) throw notFound('That assignment does not exist.');
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    checkWindow({ opensAt: body.opensAt !== undefined ? body.opensAt : iso(current.opensAt), closesAt: body.closesAt !== undefined ? body.closesAt : iso(current.closesAt), dueAt: body.dueAt !== undefined ? body.dueAt : iso(current.dueAt) });
    const date = (v: string | null) => (v ? new Date(v) : null);
    const done = await db
      .update(assignments)
      .set({
        ...(body.title ? { title: body.title } : {}),
        ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
        ...(body.dueAt !== undefined ? { dueAt: date(body.dueAt) } : {}),
        ...(body.opensAt !== undefined ? { opensAt: date(body.opensAt) } : {}),
        ...(body.closesAt !== undefined ? { closesAt: date(body.closesAt) } : {}),
        ...(body.maxAttempts !== undefined ? { maxAttempts: body.maxAttempts } : {}),
      })
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
    const { cls, teacher } = await loadClass(db, a.classId, auth);
    if (cls.archivedAt) throw conflict('This class is archived.');
    // The teacher can always try their own assignment; students are held to its dates and attempts.
    if (!teacher) {
      const [played] = await db
        .select({ n: count() })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(and(eq(gameSessions.assignmentId, a.id), eq(gameParticipants.userId, auth.user.id)));
      const blocked = assignmentBlocker(a, played?.n ?? 0);
      if (blocked) throw conflict(blocked);
    }
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
      assignment: { id: a.id, title: a.title, modeId: a.modeId, variantId: a.variantId, dueAt: a.dueAt?.toISOString() ?? null, opensAt: a.opensAt?.toISOString() ?? null, closesAt: a.closesAt?.toISOString() ?? null, maxAttempts: a.maxAttempts, setTitle: set?.title ?? 'Deleted set' },
      summary: {
        students: students.length,
        started: started.length,
        averageAccuracy: started.length ? started.reduce((n, s) => n + (s.best?.accuracy ?? 0), 0) / started.length : null,
      },
      students,
      questions,
    };
  });

  await classToolRoutes(app, deps);
  await classLoginRoutes(app, deps);

  /* ---------------------------------- school events ---------------------------------- */

  /** The teacher schedules an event for the class: their own name, dates and words. */
  app.post('/api/classes/:id/events', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(classEventSchema, req.body);
    const { teacher, cls } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can add events.');
    if (cls.archivedAt) throw conflict('This class is archived.');
    if (Date.parse(body.endsAt) <= Date.now()) throw new AppError(400, 'validation_failed', 'That event has already ended.', { endsAt: 'Pick an end in the future.' });
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(classEvents).where(and(eq(classEvents.classId, id), sql`${classEvents.endsAt} > now()`));
    if (n >= MAX_EVENTS) throw conflict(`A class can have ${MAX_EVENTS} upcoming events at most.`);
    const [row] = await db
      .insert(classEvents)
      .values({ classId: id, title: body.title, message: body.message, decor: body.decor, hue: body.hue, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), createdBy: auth.user.id })
      .returning();
    return { event: eventView(row!) };
  });

  app.delete('/api/classes/:id/events/:eid', async (req) => {
    const auth = requireAccount(req);
    const { id, eid } = parse(eventParams, req.params);
    const { teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the teacher can remove events.');
    const gone = await db.delete(classEvents).where(and(eq(classEvents.id, eid), eq(classEvents.classId, id))).returning({ id: classEvents.id });
    if (!gone.length) throw notFound('No event with that id.');
    return { ok: true };
  });

  /** Events on right now in the classes you are in or teach, for the home page. */
  app.get('/api/me/events', async (req, reply) => {
    noStore(reply);
    const auth = req.auth;
    if (!auth || auth.user.isGuest) return { events: [] };
    const rows = await db
      .select({ e: classEvents, className: classes.name, schoolName: classes.schoolName })
      .from(classEvents)
      .innerJoin(classes, eq(classes.id, classEvents.classId))
      .leftJoin(classMembers, and(eq(classMembers.classId, classes.id), eq(classMembers.userId, auth.user.id)))
      .where(and(isNull(classes.archivedAt), sql`(${classes.ownerId} = ${auth.user.id} or ${classMembers.userId} is not null)`, sql`${classEvents.startsAt} <= now()`, sql`${classEvents.endsAt} > now()`))
      .orderBy(asc(classEvents.endsAt))
      .limit(5);
    return { events: rows.map((r) => ({ ...eventView(r.e), className: r.className, schoolName: r.schoolName })) };
  });
}
