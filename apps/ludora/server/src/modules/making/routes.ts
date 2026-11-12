import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { questionSchema, SUBJECTS } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { assignments, classGroupMembers, classMembers, classTeachers, classes, customGames, gameParticipants, gameSessions, lessons, makingDrafts, makingPrefs, makingToolState, questionSets, setEditors, setFavourites, users } from '../../db/schema.ts';
import { summary } from '../sets/routes.ts';
import { noStore, requireAccount, type AuthContext } from '../../http/context.ts';
import { conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { teacherClass } from '../classes/access.ts';
import { cleanToolState, sortWork, type DueWork } from './today.ts';

/*
 * The Make page and the teacher's day (making):
 *   GET    /api/making/overview          what this account made lately, its drafts, and help it closed
 *   GET    /api/making/drafts/:id        one draft (owner only)
 *   POST   /api/making/drafts            start a draft (at most 20 each)
 *   PUT    /api/making/drafts/:id        save a draft (owner only)
 *   DELETE /api/making/drafts/:id        throw a draft away (owner only)
 *   POST   /api/making/help/:key/dismiss close a piece of help on the Make page for good
 *   GET    /api/making/today             a teacher's lessons and homework for a day, and what to follow up
 *   GET    /api/making/classes/:id/tools the classroom tools' memory for a class (its teachers only)
 *   PUT    /api/making/classes/:id/tools save it
 *   GET    /api/making/sets?tab=recent|starred  sets for the shared picker: the ones this account hosted
 *                                        or played lately, or starred, that it may still see
 * Everything is read and written for the signed-in account only; anyone else's draft is a 404.
 */

const MAX_DRAFTS = 20;
const HELP_KEYS = ['make-start', 'make-student'] as const;
const idParams = z.object({ id: z.string().uuid() });

export const draftBodySchema = z.object({
  title: z.string().trim().max(80).default(''),
  subject: z.enum(SUBJECTS).optional(),
  text: z.string().max(20_000).default(''),
  questions: z.array(questionSchema).max(250).default([]),
  /** Where the maker was: pasting, choosing what to keep, or saved as a set. */
  step: z.enum(['paste', 'choose', 'done']).default('paste'),
  setId: z.string().uuid().nullable().default(null),
});

export const toolStateSchema = z.object({
  picked: z.array(z.string().uuid()).max(300).default([]),
  scores: z
    .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/), label: z.string().trim().min(1).max(40), points: z.number().int().min(-9999).max(9999) }))
    .max(12)
    .default([]),
});

function draftId(params: unknown): string {
  const r = idParams.safeParse(params);
  if (!r.success) throw notFound('That draft does not exist.');
  return r.data.id;
}

function teacherAuth(req: Parameters<typeof requireAccount>[0]): AuthContext {
  const auth = requireAccount(req);
  if (auth.user.accountType !== 'teacher') throw forbidden('The day view is for teacher accounts. You can switch to one in Settings.');
  return auth;
}

/** Classes this account teaches (owns or co-teaches), not archived. */
async function teachingClasses(db: AppDeps['db'], userId: string) {
  return db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(isNull(classes.archivedAt), or(eq(classes.ownerId, userId), sql`${classes.id} in (select ${classTeachers.classId} from ${classTeachers} where ${classTeachers.userId} = ${userId})`)))
    .orderBy(classes.name);
}

export async function makingRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/making/overview', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const me = auth.user.id;
    const [sets, mySets, lessonRows, myLessons, games, myGames, drafts, prefs, teaching] = await Promise.all([
      db.select({ id: questionSets.id, title: questionSets.title, at: questionSets.updatedAt, n: questionSets.questionCount }).from(questionSets).where(and(eq(questionSets.ownerId, me), isNull(questionSets.deletedAt))).orderBy(desc(questionSets.updatedAt)).limit(6),
      db.select({ n: count() }).from(questionSets).where(and(eq(questionSets.ownerId, me), isNull(questionSets.deletedAt))),
      db.select({ id: lessons.id, title: lessons.title, at: lessons.updatedAt, steps: lessons.steps }).from(lessons).where(eq(lessons.ownerId, me)).orderBy(desc(lessons.updatedAt)).limit(4),
      db.select({ n: count() }).from(lessons).where(eq(lessons.ownerId, me)),
      db.select({ id: customGames.id, title: customGames.title, at: customGames.updatedAt }).from(customGames).where(eq(customGames.ownerId, me)).orderBy(desc(customGames.updatedAt)).limit(4),
      db.select({ n: count() }).from(customGames).where(eq(customGames.ownerId, me)),
      db.select().from(makingDrafts).where(eq(makingDrafts.ownerId, me)).orderBy(desc(makingDrafts.updatedAt)).limit(MAX_DRAFTS),
      db.select().from(makingPrefs).where(eq(makingPrefs.userId, me)).limit(1),
      auth.user.accountType === 'teacher' ? teachingClasses(db, me) : Promise.resolve([]),
    ]);
    const hosted = await db.select({ n: count() }).from(gameSessions).where(and(eq(gameSessions.hostUserId, me), eq(gameSessions.isSolo, false)));
    const homework = teaching.length ? await db.select({ n: count() }).from(assignments).where(inArray(assignments.classId, teaching.map((c) => c.id))) : [{ n: 0 }];
    const recent = [
      ...sets.map((s) => ({ kind: 'set' as const, id: s.id, title: s.title, at: s.at, detail: `${s.n} ${s.n === 1 ? 'question' : 'questions'}` })),
      ...lessonRows.map((l) => {
        const n = Array.isArray(l.steps) ? l.steps.length : 0;
        return { kind: 'lesson' as const, id: l.id, title: l.title, at: l.at, detail: `${n} ${n === 1 ? 'step' : 'steps'}` };
      }),
      ...games.map((g) => ({ kind: 'game' as const, id: g.id, title: g.title, at: g.at, detail: 'Saved game' })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8)
      .map((r) => ({ ...r, at: r.at.toISOString() }));
    return {
      recent,
      drafts: drafts.map((d) => {
        const body = draftBodySchema.safeParse(d.body);
        return { id: d.id, kind: d.kind, title: d.title, updatedAt: d.updatedAt.toISOString(), questions: body.success ? body.data.questions.length : 0, step: body.success ? body.data.step : 'paste' };
      }),
      counts: { sets: mySets[0]?.n ?? 0, lessons: myLessons[0]?.n ?? 0, games: myGames[0]?.n ?? 0, classes: teaching.length, hosted: hosted[0]?.n ?? 0, homework: homework[0]?.n ?? 0 },
      dismissed: prefs[0]?.dismissed ?? [],
    };
  });

  /* --------------------------------- drafts --------------------------------- */

  async function ownDraft(id: string, auth: AuthContext) {
    const [row] = await db.select().from(makingDrafts).where(and(eq(makingDrafts.id, id), eq(makingDrafts.ownerId, auth.user.id))).limit(1);
    if (!row) throw notFound('That draft does not exist.');
    return row;
  }

  const draftView = (row: typeof makingDrafts.$inferSelect) => {
    const body = draftBodySchema.safeParse(row.body);
    return { id: row.id, kind: row.kind, title: row.title, updatedAt: row.updatedAt.toISOString(), body: body.success ? body.data : draftBodySchema.parse({}) };
  };

  app.get('/api/making/drafts/:id', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    return { draft: draftView(await ownDraft(draftId(req.params), auth)) };
  });

  app.post('/api/making/drafts', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const body = parse(draftBodySchema, req.body ?? {});
    const [{ n }] = (await db.select({ n: count() }).from(makingDrafts).where(eq(makingDrafts.ownerId, auth.user.id))) as [{ n: number }];
    if (n >= MAX_DRAFTS) throw conflict(`You have ${MAX_DRAFTS} drafts, the most you can keep. Throw away one you no longer need on the Make page.`);
    const [row] = await db.insert(makingDrafts).values({ ownerId: auth.user.id, kind: 'quick', title: body.title, body }).returning();
    return { draft: draftView(row!) };
  });

  app.put('/api/making/drafts/:id', { config: { rateLimit: { max: 600, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const id = draftId(req.params);
    await ownDraft(id, auth);
    const body = parse(draftBodySchema, req.body);
    const [row] = await db.update(makingDrafts).set({ title: body.title, body, updatedAt: new Date() }).where(and(eq(makingDrafts.id, id), eq(makingDrafts.ownerId, auth.user.id))).returning();
    return { draft: draftView(row!) };
  });

  app.delete('/api/making/drafts/:id', async (req) => {
    const auth = requireAccount(req);
    const id = draftId(req.params);
    await ownDraft(id, auth);
    await db.delete(makingDrafts).where(and(eq(makingDrafts.id, id), eq(makingDrafts.ownerId, auth.user.id)));
    return { ok: true };
  });

  app.post('/api/making/help/:key/dismiss', async (req) => {
    const auth = requireAccount(req);
    const { key } = parse(z.object({ key: z.enum(HELP_KEYS) }), req.params);
    const [cur] = await db.select().from(makingPrefs).where(eq(makingPrefs.userId, auth.user.id)).limit(1);
    const dismissed = [...new Set([...(cur?.dismissed ?? []), key])];
    await db
      .insert(makingPrefs)
      .values({ userId: auth.user.id, dismissed })
      .onConflictDoUpdate({ target: makingPrefs.userId, set: { dismissed, updatedAt: new Date() } });
    return { dismissed };
  });

  /* ------------------------------ the shared picker ------------------------------ */

  app.get('/api/making/sets', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const me = auth.user.id;
    const { tab } = parse(z.object({ tab: z.enum(['recent', 'starred']) }), req.query);
    // Only sets this account may still see: its own, ones it co-edits, and public ones nobody hid.
    const visible = and(
      isNull(questionSets.deletedAt),
      or(eq(questionSets.ownerId, me), sql`${questionSets.id} in (select ${setEditors.setId} from ${setEditors} where ${setEditors.userId} = ${me})`, and(eq(questionSets.visibility, 'public'), isNull(questionSets.hiddenAt))),
    );
    let ids: string[];
    if (tab === 'recent') {
      const rows = await db
        .select({ setId: gameSessions.setId, last: sql<Date>`max(${gameSessions.startedAt})` })
        .from(gameSessions)
        .where(and(eq(gameSessions.hostUserId, me), sql`${gameSessions.setId} is not null`))
        .groupBy(gameSessions.setId)
        .orderBy(desc(sql`max(${gameSessions.startedAt})`))
        .limit(24);
      ids = rows.map((r) => r.setId!).filter(Boolean);
    } else {
      ids = (await db.select({ id: setFavourites.setId }).from(setFavourites).where(eq(setFavourites.userId, me)).limit(100)).map((r) => r.id);
    }
    if (!ids.length) return { sets: [] };
    const rows = await db.select({ s: questionSets, ownerName: users.displayName }).from(questionSets).leftJoin(users, eq(users.id, questionSets.ownerId)).where(and(inArray(questionSets.id, ids), visible));
    const order = new Map(ids.map((id, i) => [id, i]));
    const starred = tab === 'starred' ? new Set(ids) : new Set((await db.select({ id: setFavourites.setId }).from(setFavourites).where(and(eq(setFavourites.userId, me), inArray(setFavourites.setId, ids)))).map((r) => r.id));
    return {
      sets: rows
        .sort((a, b) => (tab === 'starred' ? a.s.title.localeCompare(b.s.title) : order.get(a.s.id)! - order.get(b.s.id)!))
        .map((r) => summary({ ...r.s, ownerName: r.ownerName }, { favourite: starred.has(r.s.id) })),
    };
  });

  /* ------------------------------ the teacher's day ------------------------------ */

  app.get('/api/making/today', async (req, reply) => {
    noStore(reply);
    const auth = teacherAuth(req);
    const q = parse(z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }), req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(to > from) || to.getTime() - from.getTime() > 2 * 86_400_000) throw conflict('Ask for one day at a time.');
    const me = auth.user.id;
    const teaching = await teachingClasses(db, me);
    const classIds = teaching.map((c) => c.id);
    const names = new Map(teaching.map((c) => [c.id, c.name]));
    // Lessons this teacher planned for the day (their own lessons only).
    const dayLessons = await db
      .select({ id: lessons.id, title: lessons.title, startsAt: lessons.startsAt, classId: lessons.classId, steps: lessons.steps })
      .from(lessons)
      .where(and(eq(lessons.ownerId, me), gte(lessons.startsAt, from), lt(lessons.startsAt, to)))
      .orderBy(lessons.startsAt);
    let work: DueWork[] = [];
    if (classIds.length) {
      const windowStart = new Date(from.getTime() - 14 * 86_400_000);
      const windowEnd = new Date(to.getTime() + 7 * 86_400_000);
      const tasks = await db
        .select({ id: assignments.id, classId: assignments.classId, title: assignments.title, dueAt: assignments.dueAt, groupId: assignments.groupId })
        .from(assignments)
        .where(and(inArray(assignments.classId, classIds), gte(assignments.dueAt, windowStart), lt(assignments.dueAt, windowEnd)));
      if (tasks.length) {
        const members = await db.select({ classId: classMembers.classId, userId: classMembers.userId }).from(classMembers).where(and(inArray(classMembers.classId, classIds), eq(classMembers.role, 'student')));
        const groupIds = [...new Set(tasks.map((t) => t.groupId).filter((g): g is string => Boolean(g)))];
        const groupRows = groupIds.length ? await db.select({ groupId: classGroupMembers.groupId, userId: classGroupMembers.userId }).from(classGroupMembers).where(inArray(classGroupMembers.groupId, groupIds)) : [];
        const played = await db
          .selectDistinct({ assignmentId: gameSessions.assignmentId, userId: gameParticipants.userId })
          .from(gameSessions)
          .innerJoin(gameParticipants, eq(gameParticipants.gameId, gameSessions.id))
          .where(inArray(gameSessions.assignmentId, tasks.map((t) => t.id)));
        work = tasks.map((t) => {
          const classMembersOf = new Set(members.filter((m) => m.classId === t.classId).map((m) => m.userId));
          const forWhom = t.groupId ? new Set(groupRows.filter((g) => g.groupId === t.groupId && classMembersOf.has(g.userId)).map((g) => g.userId)) : classMembersOf;
          const done = new Set(played.filter((p) => p.assignmentId === t.id && p.userId && forWhom.has(p.userId)).map((p) => p.userId));
          return { id: t.id, classId: t.classId, className: names.get(t.classId) ?? '', title: t.title, dueAt: t.dueAt, students: forWhom.size, done: done.size };
        });
      }
    }
    const sorted = sortWork(work, from, to);
    const view = (w: DueWork) => ({ ...w, dueAt: w.dueAt?.toISOString() ?? null });
    return {
      lessons: dayLessons.map((l) => ({ id: l.id, title: l.title, startsAt: l.startsAt?.toISOString() ?? null, classId: l.classId, className: l.classId ? (names.get(l.classId) ?? null) : null, steps: Array.isArray(l.steps) ? l.steps.length : 0 })),
      dueToday: sorted.dueToday.map(view),
      dueSoon: sorted.dueSoon.map(view),
      followUp: sorted.followUp.map(view),
      classes: teaching,
    };
  });

  /* ------------------------------ classroom tools ------------------------------ */

  async function classMemberIds(classId: string): Promise<Set<string>> {
    const rows = await db.select({ id: classMembers.userId }).from(classMembers).innerJoin(users, eq(users.id, classMembers.userId)).where(eq(classMembers.classId, classId));
    return new Set(rows.map((r) => r.id));
  }

  app.get('/api/making/classes/:id/tools', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await teacherClass(db, id, auth, 'Only the class’s teachers can use its classroom tools.');
    const [row] = await db.select().from(makingToolState).where(and(eq(makingToolState.ownerId, auth.user.id), eq(makingToolState.classId, id))).limit(1);
    const stored = toolStateSchema.safeParse(row?.state ?? {});
    return { state: cleanToolState(stored.success ? stored.data : { picked: [], scores: [] }, await classMemberIds(id)) };
  });

  app.put('/api/making/classes/:id/tools', { config: { rateLimit: { max: 600, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await teacherClass(db, id, auth, 'Only the class’s teachers can use its classroom tools.');
    const body = parse(toolStateSchema, req.body);
    // Only students of this class can be remembered as picked.
    const state = cleanToolState(body, await classMemberIds(id));
    await db
      .insert(makingToolState)
      .values({ ownerId: auth.user.id, classId: id, state })
      .onConflictDoUpdate({ target: [makingToolState.ownerId, makingToolState.classId], set: { state, updatedAt: new Date() } });
    return { state };
  });
}
