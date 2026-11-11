import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { cleanText, containsBlockedLanguage } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { assignments, classGroupMembers, classGroups, classMembers, classTeachers, users } from '../../db/schema.ts';
import { requireAccount } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit } from '../admin/common.ts';
import { notify } from '../notifications/service.ts';
import { loadClass, teacherClass } from './access.ts';

/*
 * Co-teachers and class groups (finish).
 *
 * Co-teachers: the class's owner adds another teacher by their exact username. A co-teacher can
 * run the class as the owner does (assignments, reports, live games, notices), every route
 * checking either on the server; only the owner adds or removes teachers and archives the class.
 * A username that does not exist, or is not a teacher's, gets the same answer, so the form says
 * nothing about anyone's account.
 *
 * Groups: named groups inside a class (a reading group, a table). A teacher can set work for one
 * group; a student sees, starts and is reminded about only the whole class's work and their own
 * groups' work. Students see their own groups' names, never who else is in them.
 */

export const MAX_CO_TEACHERS = 5;
export const MAX_GROUPS = 30;

const idParam = z.object({ id: z.string().uuid('No class with that id.') });
const groupParams = z.object({ id: z.string().uuid(), gid: z.string().uuid('No group with that id.') });
const groupName = z
  .string()
  .max(60)
  .transform(cleanText)
  .pipe(z.string().min(1, 'Give the group a name.').max(40, 'Use at most 40 characters.'));

/** Each group of a class with its members, for the teacher. */
export async function groupsOf(db: DbOrTx, classId: string): Promise<{ id: string; name: string; memberIds: string[] }[]> {
  const groups = await db.select().from(classGroups).where(eq(classGroups.classId, classId)).orderBy(asc(classGroups.name));
  const members = groups.length ? await db.select({ groupId: classGroupMembers.groupId, userId: classGroupMembers.userId }).from(classGroupMembers).where(eq(classGroupMembers.classId, classId)) : [];
  return groups.map((g) => ({ id: g.id, name: g.name, memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId) }));
}

/** The groups a student is in, in one class. */
export async function myGroups(db: DbOrTx, classId: string, userId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: classGroups.id, name: classGroups.name })
    .from(classGroupMembers)
    .innerJoin(classGroups, eq(classGroups.id, classGroupMembers.groupId))
    .where(and(eq(classGroupMembers.classId, classId), eq(classGroupMembers.userId, userId)))
    .orderBy(asc(classGroups.name));
}

/** Whether a piece of work is set for someone in these groups: the whole class's work, or one of their groups'. */
export function setForGroups(a: { groupId: string | null }, groupIds: ReadonlySet<string>): boolean {
  return !a.groupId || groupIds.has(a.groupId);
}

/** Who each group's work is for: group id to its members. Work for the whole class is for everyone. */
export function membersFor(a: { groupId: string | null }, groups: readonly { id: string; memberIds: string[] }[], everyone: readonly string[]): Set<string> {
  if (!a.groupId) return new Set(everyone);
  return new Set(groups.find((g) => g.id === a.groupId)?.memberIds ?? []);
}

/** A group id given for work must be a group of this class. */
export async function checkGroup(db: DbOrTx, classId: string, groupId: string | null | undefined): Promise<void> {
  if (!groupId) return;
  const [g] = await db.select({ id: classGroups.id }).from(classGroups).where(and(eq(classGroups.id, groupId), eq(classGroups.classId, classId))).limit(1);
  if (!g) throw new AppError(400, 'validation_failed', 'That group is not in this class.', { groupId: 'Choose one of this class’s groups, or the whole class.' });
}

/** The class's teachers: the owner first, then co-teachers, display names only. */
export async function teachersOf(db: DbOrTx, cls: { id: string; ownerId: string }): Promise<{ id: string; displayName: string; owner: boolean }[]> {
  const [owner] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, cls.ownerId)).limit(1);
  const co = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(classTeachers)
    .innerJoin(users, eq(users.id, classTeachers.userId))
    .where(eq(classTeachers.classId, cls.id))
    .orderBy(asc(classTeachers.addedAt));
  return [...(owner ? [{ ...owner, owner: true }] : []), ...co.map((c) => ({ ...c, owner: false }))];
}

export async function classGroupRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ----------------------------------- co-teachers ----------------------------------- */

  /** The owner adds a teacher by exact username. Same refusal for no such account and for a non-teacher. */
  app.post('/api/classes/:id/teachers', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const { username } = parse(z.object({ username: z.string().trim().toLowerCase().min(1, 'Type their username.').max(40) }), req.body);
    const { cls, owner } = await loadClass(db, id, auth);
    if (!owner) throw forbidden('Only the teacher who made the class can add teachers to it.');
    if (cls.archivedAt) throw conflict('This class is archived. Unarchive it first.');
    const unknown = new AppError(404, 'not_found', 'No teacher account has that username. Check the spelling with your colleague: it is the name they sign in with.', { username: 'No teacher account has that username.' });
    const [u] = await db.select({ id: users.id, displayName: users.displayName, accountType: users.accountType, isGuest: users.isGuest }).from(users).where(eq(users.username, username)).limit(1);
    if (!u || u.isGuest || u.accountType !== 'teacher') throw unknown;
    if (u.id === cls.ownerId) throw conflict('You already teach this class.', { username: 'That is you.' });
    const [n] = await db.select({ n: count() }).from(classTeachers).where(eq(classTeachers.classId, id));
    if ((n?.n ?? 0) >= MAX_CO_TEACHERS) throw conflict(`A class can have up to ${MAX_CO_TEACHERS} other teachers. Remove one first.`);
    // A teacher who is also on the roster as a student comes off it: they teach the class now.
    const added = await db.transaction(async (tx) => {
      const rows = await tx.insert(classTeachers).values({ classId: id, userId: u.id, addedBy: auth.user.id }).onConflictDoNothing().returning();
      if (!rows.length) return false;
      await tx.delete(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, u.id)));
      await tx.delete(classGroupMembers).where(and(eq(classGroupMembers.classId, id), eq(classGroupMembers.userId, u.id)));
      await notify(tx, { userId: u.id, kind: 'school', title: `${auth.user.displayName} added you as a teacher of ${cls.name}`, body: 'You can set work, see reports and host games for this class.', link: `/classes/${id}`, actorId: auth.user.id, dedupeKey: `coteacher:${id}:${u.id}` });
      await audit(deps, req, tx, { actor: auth, action: 'class.co_teacher_add', targetType: 'class', targetId: id, targetName: cls.name, reason: username });
      return true;
    });
    if (!added) throw conflict('They already teach this class.', { username: 'They already teach this class.' });
    return { ok: true, teacher: { id: u.id, displayName: u.displayName, owner: false } };
  });

  /** The owner removes a co-teacher, or a co-teacher leaves. */
  app.delete('/api/classes/:id/teachers/:userId', async (req) => {
    const auth = requireAccount(req);
    const { id, userId } = parse(z.object({ id: z.string().uuid(), userId: z.string().uuid() }), req.params);
    const { cls, owner, teacher } = await loadClass(db, id, auth);
    if (!teacher) throw forbidden('Only the class’s teachers can change who teaches it.');
    if (!owner && userId !== auth.user.id) throw forbidden('Only the teacher who made the class can remove other teachers.');
    if (userId === cls.ownerId) throw conflict('The teacher who made the class cannot be removed from it.');
    const gone = await db.delete(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.userId, userId))).returning({ u: classTeachers.userId });
    if (!gone.length) throw notFound('That teacher does not teach this class.');
    return { ok: true };
  });

  /* -------------------------------------- groups -------------------------------------- */

  app.post('/api/classes/:id/groups', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: groupName, memberIds: z.array(z.string().uuid()).max(300).default([]) }), req.body);
    await teacherClass(db, id, auth, 'Only the teacher can make groups.', { active: true });
    if (containsBlockedLanguage(body.name)) throw new AppError(400, 'validation_failed', 'That name has a word Ludora does not allow.', { name: 'Reword this: it has a word Ludora does not allow.' });
    const existing = await db.select({ name: classGroups.name }).from(classGroups).where(eq(classGroups.classId, id));
    if (existing.length >= MAX_GROUPS) throw conflict(`A class can have up to ${MAX_GROUPS} groups. Delete one first.`);
    if (existing.some((g) => g.name.toLowerCase() === body.name.toLowerCase())) throw new AppError(409, 'conflict', 'This class already has a group with that name.', { name: 'Choose a different name.' });
    const group = await db.transaction(async (tx) => {
      const [g] = await tx.insert(classGroups).values({ classId: id, name: body.name }).returning();
      await setMembers(tx, id, g!.id, body.memberIds);
      return g!;
    });
    return { ok: true, group: { id: group.id, name: group.name } };
  });

  /** Rename a group or set who is in it (the whole list: students not in the class are ignored). */
  app.patch('/api/classes/:id/groups/:gid', async (req) => {
    const auth = requireAccount(req);
    const { id, gid } = parse(groupParams, req.params);
    const body = parse(z.object({ name: groupName.optional(), memberIds: z.array(z.string().uuid()).max(300).optional() }), req.body);
    await teacherClass(db, id, auth, 'Only the teacher can change groups.', { active: true });
    const [g] = await db.select().from(classGroups).where(and(eq(classGroups.id, gid), eq(classGroups.classId, id))).limit(1);
    if (!g) throw notFound('That group is not in this class.');
    if (body.name !== undefined) {
      if (containsBlockedLanguage(body.name)) throw new AppError(400, 'validation_failed', 'That name has a word Ludora does not allow.', { name: 'Reword this: it has a word Ludora does not allow.' });
      const clash = await db.select({ id: classGroups.id, name: classGroups.name }).from(classGroups).where(eq(classGroups.classId, id));
      if (clash.some((c) => c.id !== gid && c.name.toLowerCase() === body.name!.toLowerCase())) throw new AppError(409, 'conflict', 'This class already has a group with that name.', { name: 'Choose a different name.' });
    }
    await db.transaction(async (tx) => {
      if (body.name !== undefined) await tx.update(classGroups).set({ name: body.name }).where(eq(classGroups.id, gid));
      if (body.memberIds) await setMembers(tx, id, gid, body.memberIds);
    });
    return { ok: true };
  });

  /** A group with work set for it cannot go: its students would suddenly see that work, or lose it. */
  app.delete('/api/classes/:id/groups/:gid', async (req) => {
    const auth = requireAccount(req);
    const { id, gid } = parse(groupParams, req.params);
    await teacherClass(db, id, auth, 'Only the teacher can delete groups.');
    const [used] = await db.select({ n: count() }).from(assignments).where(and(eq(assignments.classId, id), eq(assignments.groupId, gid)));
    if ((used?.n ?? 0) > 0) throw conflict(`${used!.n === 1 ? 'One assignment is' : `${used!.n} assignments are`} set for this group. Set ${used!.n === 1 ? 'it' : 'them'} for the whole class or delete ${used!.n === 1 ? 'it' : 'them'} first.`);
    const gone = await db.delete(classGroups).where(and(eq(classGroups.id, gid), eq(classGroups.classId, id))).returning({ id: classGroups.id });
    if (!gone.length) throw notFound('That group is not in this class.');
    return { ok: true };
  });
}

/** Replace a group's members with those of the given ids who are in the class. */
async function setMembers(tx: DbOrTx, classId: string, groupId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const inClass = unique.length ? (await tx.select({ u: classMembers.userId }).from(classMembers).where(and(eq(classMembers.classId, classId), inArray(classMembers.userId, unique)))).map((r) => r.u) : [];
  await tx.delete(classGroupMembers).where(eq(classGroupMembers.groupId, groupId));
  if (inClass.length) await tx.insert(classGroupMembers).values(inClass.map((userId) => ({ groupId, classId, userId })));
}

/** When students leave a class, they leave its groups too. */
export async function leaveGroups(tx: DbOrTx, classId: string, userIds: readonly string[]) {
  if (!userIds.length) return;
  await tx.delete(classGroupMembers).where(and(eq(classGroupMembers.classId, classId), inArray(classGroupMembers.userId, userIds as string[])));
}
