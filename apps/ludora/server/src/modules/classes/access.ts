import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { classMembers, classTeachers, classes } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { conflict, forbidden, notFound } from '../../lib/errors.ts';

export type ClassRow = typeof classes.$inferSelect;

/**
 * The class and the viewer's place in it, or a 404 that says nothing about classes the viewer is not part of.
 * `teacher` is the owner or a co-teacher the owner added (both can run the class); `owner` is the owner only.
 */
export async function loadClass(db: DbOrTx, id: string, auth: AuthContext): Promise<{ cls: ClassRow; teacher: boolean; owner: boolean; member: boolean }> {
  const [cls] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  if (!cls) throw notFound('That class does not exist.');
  const owner = cls.ownerId === auth.user.id;
  const [co] = owner ? [] : await db.select({ u: classTeachers.userId }).from(classTeachers).where(and(eq(classTeachers.classId, id), eq(classTeachers.userId, auth.user.id))).limit(1);
  const teacher = owner || Boolean(co);
  const [m] = teacher ? [] : await db.select().from(classMembers).where(and(eq(classMembers.classId, id), eq(classMembers.userId, auth.user.id))).limit(1);
  if (!teacher && !m) throw notFound('That class does not exist.');
  return { cls, teacher, owner, member: Boolean(m) };
}

/** Whether an account teaches a class: its owner or one of its co-teachers. */
export async function teachesClass(db: DbOrTx, classId: string, userId: string): Promise<boolean> {
  const [cls] = await db.select({ ownerId: classes.ownerId }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) return false;
  if (cls.ownerId === userId) return true;
  const [co] = await db.select({ u: classTeachers.userId }).from(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.userId, userId))).limit(1);
  return Boolean(co);
}

/** The ids of the classes an account co-teaches (not the ones it owns). */
export async function coTaughtClassIds(db: DbOrTx, userId: string): Promise<string[]> {
  return (await db.select({ id: classTeachers.classId }).from(classTeachers).where(eq(classTeachers.userId, userId))).map((r) => r.id);
}

/** The class, for its teacher only. Students in it get a 403 with the reason; everyone else a 404. */
export async function teacherClass(db: DbOrTx, id: string, auth: AuthContext, refusal: string, opts: { active?: boolean } = {}): Promise<ClassRow> {
  const { cls, teacher } = await loadClass(db, id, auth);
  if (!teacher) throw forbidden(refusal);
  if (opts.active && cls.archivedAt) throw conflict('This class is archived. Unarchive it first.');
  return cls;
}

export function requireTeacherAccount(auth: AuthContext) {
  if (auth.user.accountType !== 'teacher') throw forbidden('Classes are made with a teacher account. You can switch to one in Settings.');
}

/** Whether a student can start an assignment now, and if not, why. Pure, so the class page and the play route agree. */
export function assignmentBlocker(a: { opensAt: Date | null; closesAt: Date | null; maxAttempts: number | null }, plays: number, now = new Date()): string | null {
  if (a.opensAt && a.opensAt > now) return `This assignment opens on ${dayText(a.opensAt)}.`;
  if (a.closesAt && a.closesAt <= now) return 'This assignment has closed. Ask your teacher if you still need to play it.';
  if (a.maxAttempts !== null && plays >= a.maxAttempts) return a.maxAttempts === 1 ? 'You have used your one attempt at this assignment.' : `You have used all ${a.maxAttempts} attempts at this assignment.`;
  return null;
}

function dayText(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' (UTC)';
}
