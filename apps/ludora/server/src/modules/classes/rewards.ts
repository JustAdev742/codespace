import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { classMembers, classRewards, classes, users } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { AppError, conflict } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { nextWeeklyReset, weekStart } from '../../lib/time.ts';
import { containsBlockedLanguage } from '@ludora/shared';
import { audit } from '../admin/common.ts';
import { getRules } from '../economy/config.ts';
import { credit, IDEMPOTENCY_KEY_PATTERN, withOperation } from '../economy/service.ts';
import { teacherClass } from './access.ts';

/*
 * Class rewards (D58): a teacher gives Sparks to one student or the whole class, with a reason the
 * student sees, out of a weekly budget per class set in the economy rules. School staff merits
 * earn house points and never currency (that stays as it is); this is the one way a teacher can
 * give Sparks. Students cannot give anything to each other.
 */

const idParam = z.object({ id: z.string().uuid() });

export const rewardSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    wholeClass: z.boolean().default(false),
    amount: z.number().int().min(1).max(1000),
    note: z.string().trim().min(3, 'Say what it is for (at least 3 characters).').max(140),
    requestKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN, 'Missing request key'),
  })
  .refine((r) => Boolean(r.studentId) !== r.wholeClass, 'Choose one student or the whole class.');

/** What an award costs the budget: the amount for each student it reaches. */
export function awardCost(amountEach: number, students: number): number {
  return amountEach * students;
}

/** Whether an award fits the week's budget and the per-student limit, and if not, why (in words for a teacher). */
export function budgetProblem(o: { amountEach: number; students: number; used: number; budget: number; maxPerStudent: number }): string | null {
  if (o.students < 1) return 'There are no students to reward.';
  if (o.amountEach > o.maxPerStudent) return `You can give up to ${o.maxPerStudent} Sparks to each student at a time.`;
  const left = Math.max(0, o.budget - o.used);
  const cost = awardCost(o.amountEach, o.students);
  if (cost > left) {
    return o.students > 1
      ? `That needs ${cost} Sparks (${o.amountEach} each for ${o.students} students), and this class has ${left} left this week.`
      : `That needs ${cost} Sparks, and this class has ${left} left this week.`;
  }
  return null;
}

async function usedThisWeek(db: DbOrTx, classId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${classRewards.amount}), 0)::int` })
    .from(classRewards)
    .where(and(eq(classRewards.classId, classId), gte(classRewards.createdAt, weekStart(now))));
  return row?.n ?? 0;
}

export async function classRewardRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** The class's budget this week, each student's total this week, and the latest awards. Teacher only. */
  app.get('/api/classes/:id/rewards', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    await teacherClass(db, id, auth, 'Only the class teacher can give class rewards.');
    const rules = await getRules(db);
    const since = weekStart();
    const [used, students, recent] = await Promise.all([
      usedThisWeek(db, id),
      db
        .select({ id: users.id, name: users.displayName, thisWeek: sql<number>`coalesce((select sum(r.amount) from ${classRewards} r where r.class_id = ${id} and r.student_id = ${users.id} and r.created_at >= ${since}), 0)::int` })
        .from(classMembers)
        .innerJoin(users, eq(users.id, classMembers.userId))
        .where(and(eq(classMembers.classId, id), eq(classMembers.role, 'student')))
        .orderBy(users.displayName),
      db
        .select({
          batchId: classRewards.batchId,
          teacherName: sql<string>`min(${classRewards.teacherName})`,
          note: sql<string>`min(${classRewards.note})`,
          amount: sql<number>`min(${classRewards.amount})::int`,
          students: sql<number>`count(*)::int`,
          wholeClass: sql<boolean>`bool_or(${classRewards.wholeClass})`,
          studentName: sql<string | null>`case when count(*) = 1 then min(${users.displayName}) end`,
          at: sql<string>`max(${classRewards.createdAt})`,
        })
        .from(classRewards)
        .innerJoin(users, eq(users.id, classRewards.studentId))
        .where(eq(classRewards.classId, id))
        .groupBy(classRewards.batchId)
        .orderBy(desc(sql`max(${classRewards.createdAt})`))
        .limit(20),
    ]);
    return {
      budget: rules.classRewards.weeklyBudget,
      maxPerStudent: rules.classRewards.maxPerStudent,
      used,
      left: Math.max(0, rules.classRewards.weeklyBudget - used),
      resetsAt: nextWeeklyReset().toISOString(),
      students,
      recent: recent.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
    };
  });

  /** Give Sparks to one student or every student, out of this week's budget. */
  app.post('/api/classes/:id/rewards', { config: { rateLimit: { max: 30, timeWindow: '1 hour', keyGenerator: (r) => (r.auth ? `classreward:${r.auth.user.id}` : r.ip || 'gone') } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParam, req.params);
    const body = parse(rewardSchema, req.body);
    if (containsBlockedLanguage(body.note)) throw new AppError(400, 'validation_failed', 'Please reword the reason.', { note: 'Please reword this.' });
    await teacherClass(db, id, auth, 'Only the class teacher can give class rewards.', { active: true });
    const rules = await getRules(db);
    const { result, replayed } = await withOperation(db, auth.user.id, `classreward:${body.requestKey}`, 'class_reward', async (tx, opId) => {
      // One award at a time per class, so two teachers pressing at once cannot both spend the last of the budget.
      await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, id)).for('update');
      const members = await tx.select({ userId: classMembers.userId, name: users.displayName }).from(classMembers).innerJoin(users, eq(users.id, classMembers.userId)).where(and(eq(classMembers.classId, id), eq(classMembers.role, 'student')));
      const targets = body.wholeClass ? members : members.filter((m) => m.userId === body.studentId);
      if (!body.wholeClass && !targets.length) throw conflict('That student is not in this class.');
      const used = await usedThisWeek(tx, id);
      const problem = budgetProblem({ amountEach: body.amount, students: targets.length, used, budget: rules.classRewards.weeklyBudget, maxPerStudent: rules.classRewards.maxPerStudent });
      if (problem) throw new AppError(409, 'conflict', problem, { amount: problem });
      const batchId = randomUUID();
      for (const t of targets) {
        const [row] = await tx
          .insert(classRewards)
          .values({ classId: id, studentId: t.userId, teacherId: auth.user.id, teacherName: auth.user.displayName, amount: body.amount, note: body.note, batchId, wholeClass: body.wholeClass })
          .returning({ id: classRewards.id });
        await credit(tx, { userId: t.userId, currency: 'sparks', amount: body.amount, reason: 'class_reward', refType: 'class_reward', refId: row!.id, opId, actorId: auth.user.id, metadata: { classId: id } });
      }
      const total = awardCost(body.amount, targets.length);
      await audit(deps, req, tx, {
        actor: auth,
        action: 'class.reward',
        targetType: 'class',
        targetId: id,
        targetName: body.wholeClass ? 'whole class' : targets[0]!.name,
        reason: body.note,
        after: { currency: 'sparks', amountEach: body.amount, students: targets.length, total, batchId },
      });
      return { batchId, students: targets.length, amountEach: body.amount, total, left: Math.max(0, rules.classRewards.weeklyBudget - used - total) };
    });
    return { ok: true, replayed, ...result };
  });
}
