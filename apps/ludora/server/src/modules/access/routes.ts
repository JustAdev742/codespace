import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RouteModule } from '../../app.ts';
import { classMembers } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { parse } from '../../lib/validate.ts';
import { notFound } from '../../lib/errors.ts';
import { teacherClass } from '../classes/access.ts';

/*
 * Access arrangements a teacher keeps for a class: extra time on timed questions for chosen
 * students, applied whenever the teacher hosts a live game for the class (rooms/routes.ts).
 * Only the class teacher can see or change them; students never see who has extra time.
 */

const SHARES = [0, 25, 50, 100] as const;

export const accessRoutes: RouteModule = async (app, deps) => {
  app.get('/api/classes/:id/extra-time', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const cls = await teacherClass(deps.db, id, auth, 'Only the class teacher can see access arrangements.');
    const rows = await deps.db.select({ userId: classMembers.userId, extra: classMembers.extraTime }).from(classMembers).where(eq(classMembers.classId, cls.id));
    return { extraTime: Object.fromEntries(rows.filter((r) => r.extra > 0).map((r) => [r.userId, r.extra])) };
  });

  app.put('/api/classes/:id/extra-time/:userId', async (req) => {
    const auth = requireAccount(req);
    const { id, userId } = parse(z.object({ id: z.string().uuid(), userId: z.string().uuid() }), req.params);
    const { percent } = parse(z.object({ percent: z.number().int().refine((n) => (SHARES as readonly number[]).includes(n), 'Extra time is none, a quarter, a half or double.') }), req.body);
    const cls = await teacherClass(deps.db, id, auth, 'Only the class teacher can give extra time.');
    const updated = await deps.db
      .update(classMembers)
      .set({ extraTime: percent })
      .where(and(eq(classMembers.classId, cls.id), eq(classMembers.userId, userId)))
      .returning({ userId: classMembers.userId });
    if (!updated.length) throw notFound('That student is not in this class.');
    return { ok: true, percent };
  });
};
