import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { schoolEventSchema, schoolNoticeSchema, type NoticeAudience } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { schoolEvents, schoolNotices } from '../../db/schema.ts';
import { noStore, requireAuth, type AuthContext } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';

/*
 * School-wide notices and events, run by school staff (`school.manage`). A notice has an audience
 * (students, teachers or everyone) and shows between its start and end; an event shows a countdown
 * on everyone's home page for the fortnight before it, and themes the lobby while it is on.
 */

/** Which audiences a viewer belongs to. School staff count as teachers. */
export function audiencesFor(auth: AuthContext): NoticeAudience[] {
  const teacher = auth.user.accountType === 'teacher' || auth.permissions.has('school.manage');
  return teacher ? ['teachers', 'everyone'] : ['students', 'everyone'];
}

const noticeView = (n: typeof schoolNotices.$inferSelect) => ({ id: n.id, title: n.title, body: n.body, audience: n.audience as NoticeAudience, startsAt: n.startsAt.toISOString(), endsAt: n.endsAt.toISOString() });
const eventView = (e: typeof schoolEvents.$inferSelect) => ({ id: e.id, title: e.title, message: e.message, decor: e.decor, hue: e.hue, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString() });

/** How far ahead the countdown starts. */
export const COUNTDOWN_DAYS = 14;

/** The school event that is on now, or else the next one within the countdown window. */
export async function currentSchoolEvent(db: DbOrTx, now = new Date()) {
  const soon = new Date(now.getTime() + COUNTDOWN_DAYS * 86_400_000);
  const [e] = await db.select().from(schoolEvents).where(and(gt(schoolEvents.endsAt, now), lte(schoolEvents.startsAt, soon))).orderBy(asc(schoolEvents.startsAt)).limit(1);
  return e ? { ...eventView(e), on: e.startsAt <= now } : null;
}

export async function schoolEventRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Notices for this viewer that are showing now. */
  app.get('/api/school/notices', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const now = new Date();
    const rows = await db
      .select()
      .from(schoolNotices)
      .where(and(lte(schoolNotices.startsAt, now), gt(schoolNotices.endsAt, now), inArray(schoolNotices.audience, audiencesFor(auth))))
      .orderBy(desc(schoolNotices.startsAt))
      .limit(10);
    return { notices: rows.map(noticeView) };
  });

  /** For school staff: every notice that has not ended, scheduled ones included. */
  app.get('/api/school/notices/all', async (req, reply) => {
    noStore(reply);
    staff(req, 'school.manage');
    const rows = await db.select().from(schoolNotices).where(gt(schoolNotices.endsAt, new Date())).orderBy(asc(schoolNotices.startsAt)).limit(100);
    return { notices: rows.map(noticeView) };
  });

  app.post('/api/school/notices', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const body = parse(schoolNoticeSchema, req.body);
    if (Date.parse(body.endsAt) <= Date.now()) throw new AppError(400, 'validation_failed', 'That notice would already be over.', { endsAt: 'Choose an end in the future.' });
    const notice = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schoolNotices).values({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), createdBy: auth.user.id }).returning();
      await audit(deps, req, tx, { actor: auth, action: 'school.notice.create', targetType: 'school_notice', targetId: row!.id, targetName: row!.title, after: body });
      return row!;
    });
    return { notice: noticeView(notice) };
  });

  app.delete('/api/school/notices/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'school.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await db.transaction(async (tx) => {
      const [row] = await tx.delete(schoolNotices).where(eq(schoolNotices.id, id)).returning();
      if (!row) throw notFound('That notice has already gone.');
      await audit(deps, req, tx, { actor: auth, action: 'school.notice.delete', targetType: 'school_notice', targetId: id, targetName: row.title });
    });
    return { ok: true };
  });

  /** The event on now or coming up soon, for the countdown banner and the lobby. */
  app.get('/api/school/event', async (req, reply) => {
    noStore(reply);
    requireAuth(req);
    return { event: await currentSchoolEvent(db) };
  });

  app.get('/api/school/events', async (req, reply) => {
    noStore(reply);
    staff(req, 'school.manage');
    const rows = await db.select().from(schoolEvents).where(gt(schoolEvents.endsAt, new Date())).orderBy(asc(schoolEvents.startsAt)).limit(50);
    return { events: rows.map(eventView) };
  });

  app.post('/api/school/events', staffLimit(20), async (req) => {
    const auth = staff(req, 'school.manage');
    const body = parse(schoolEventSchema, req.body);
    if (Date.parse(body.endsAt) <= Date.now()) throw new AppError(400, 'validation_failed', 'That event would already be over.', { endsAt: 'Choose an end in the future.' });
    const event = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schoolEvents).values({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), createdBy: auth.user.id }).returning();
      await audit(deps, req, tx, { actor: auth, action: 'school.event.create', targetType: 'school_event', targetId: row!.id, targetName: row!.title, after: body });
      return row!;
    });
    return { event: eventView(event) };
  });

  app.delete('/api/school/events/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'school.manage');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await db.transaction(async (tx) => {
      const [row] = await tx.delete(schoolEvents).where(eq(schoolEvents.id, id)).returning();
      if (!row) throw notFound('That event has already gone.');
      await audit(deps, req, tx, { actor: auth, action: 'school.event.delete', targetType: 'school_event', targetId: id, targetName: row.title });
    });
    return { ok: true };
  });
}
