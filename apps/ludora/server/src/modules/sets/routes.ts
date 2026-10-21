import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { questionSchema, questionSetInputSchema, SUBJECTS, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { questionSets, users } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth, requirePermission } from '../../http/context.ts';
import { AppError, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { canEdit, canView, loadSet, type SetRow } from './access.ts';
import { withOperation } from '../economy/service.ts';
import { checkAchievements } from '../progression/achievements.ts';

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  subject: z.enum(SUBJECTS).optional(),
  scope: z.enum(['public', 'mine', 'official', 'featured']).default('public'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

function summary(s: SetRow & { ownerName?: string | null }) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    subject: s.subject,
    gradeBand: s.gradeBand,
    tags: s.tags,
    visibility: s.visibility,
    cover: s.cover,
    questionCount: s.questionCount,
    isOfficial: s.isOfficial,
    isFeatured: s.isFeatured,
    hidden: Boolean(s.hiddenAt),
    plays: s.plays,
    ownerId: s.ownerId,
    ownerName: s.ownerName ?? (s.isOfficial ? 'Ludora' : null),
    updatedAt: s.updatedAt,
  };
}

/** For people who cannot edit a set: prompts and choice texts, never which answer is right. */
function preview(questions: Question[], limit: number) {
  return questions.slice(0, limit).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.type === 'mcq' || q.type === 'multi' ? { choices: q.choices.map((c) => c.text) } : {}),
  }));
}

export async function setRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/sets', async (req, reply) => {
    noStore(reply);
    const q = parse(listQuery, req.query);
    const conds: (SQL | undefined)[] = [isNull(questionSets.hiddenAt)];
    if (q.scope === 'mine') {
      const auth = requireAuth(req);
      conds.length = 0;
      conds.push(eq(questionSets.ownerId, auth.user.id));
    } else if (q.scope === 'official') conds.push(eq(questionSets.isOfficial, true), eq(questionSets.visibility, 'public'));
    else if (q.scope === 'featured') conds.push(eq(questionSets.visibility, 'public'), or(eq(questionSets.isFeatured, true), eq(questionSets.isOfficial, true)));
    else conds.push(eq(questionSets.visibility, 'public'));
    if (q.subject) conds.push(eq(questionSets.subject, q.subject));
    if (q.q) {
      const words = q.q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
      const tsq = words.map((w) => `${w}:*`).join(' & ');
      conds.push(tsq ? or(sql`${questionSets.search} @@ to_tsquery('simple', ${tsq})`, ilike(questionSets.title, `%${q.q}%`)) : ilike(questionSets.title, `%${q.q}%`));
    }
    const where = and(...conds);
    const rows = await deps.db
      .select({ s: questionSets, ownerName: users.displayName })
      .from(questionSets)
      .leftJoin(users, eq(users.id, questionSets.ownerId))
      .where(where)
      .orderBy(desc(questionSets.isFeatured), desc(questionSets.isOfficial), desc(questionSets.plays), desc(questionSets.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ n }] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(where)) as [{ n: number }];
    return { sets: rows.map((r) => summary({ ...r.s, ownerName: r.ownerName })), total: n, page: q.page, pageSize: q.pageSize };
  });

  app.get('/api/sets/:id', async (req, reply) => {
    noStore(reply);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    if (!set || !canView(set, req.auth)) throw notFound('That question set does not exist or is private.');
    const questions = ((set.questions as unknown[]) ?? []).map((q) => questionSchema.safeParse(q)).filter((r) => r.success).map((r) => r.data!);
    const editable = canEdit(set, req.auth);
    const [owner] = set.ownerId ? await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, set.ownerId)).limit(1) : [];
    return {
      set: summary({ ...set, ownerName: owner?.name ?? null }),
      editable,
      questions: editable ? questions : null,
      preview: editable ? null : preview(questions, 6),
      typeCounts: questions.reduce<Record<string, number>>((acc, q) => ((acc[q.type] = (acc[q.type] ?? 0) + 1), acc), {}),
    };
  });

  const checkVisibility = (visibility: string, auth: { permissions: Set<string> }) => {
    if (visibility === 'public' && !auth.permissions.has('sets.publish_public')) {
      throw new AppError(403, 'forbidden', 'Publishing sets to the public library needs a trusted account. You can share it with a link by making it unlisted.');
    }
  };

  app.post('/api/sets', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    const body = parse(questionSetInputSchema, req.body);
    checkVisibility(body.visibility, auth);
    const [owned] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id))) as [{ n: number }];
    if (owned.n >= 500) throw new AppError(409, 'conflict', 'You have reached the limit of 500 sets. Delete some you no longer use.');
    const [row] = await deps.db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: body.title, description: body.description, subject: body.subject, gradeBand: body.gradeBand ?? null, language: body.language, tags: body.tags, visibility: body.visibility, cover: body.cover ?? null, questions: body.questions, questionCount: body.questions.length })
      .returning();
    // Creating sets counts towards achievements.
    await withOperation(deps.db, auth.user.id, `set-created:${row!.id}`, 'set_created', async (tx, opId) => {
      await checkAchievements(tx, auth.user.id, opId);
      return { ok: true };
    }).catch(() => {});
    return { set: summary(row!) };
  });

  app.put('/api/sets/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    if (!set || !canView(set, auth)) throw notFound('That question set does not exist.');
    if (!canEdit(set, auth)) throw forbidden('Only the owner can edit this set. Make a copy to change it.');
    const body = parse(questionSetInputSchema, req.body);
    if (body.visibility !== set.visibility) checkVisibility(body.visibility, auth);
    const [row] = await deps.db
      .update(questionSets)
      .set({ title: body.title, description: body.description, subject: body.subject, gradeBand: body.gradeBand ?? null, language: body.language, tags: body.tags, visibility: body.visibility, cover: body.cover ?? null, questions: body.questions, questionCount: body.questions.length, updatedAt: new Date() })
      .where(eq(questionSets.id, id))
      .returning();
    return { set: summary(row!) };
  });

  app.delete('/api/sets/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    if (!set || !canEdit(set, auth)) throw notFound('That question set does not exist.');
    await deps.db.delete(questionSets).where(eq(questionSets.id, id));
    return { ok: true };
  });

  app.post('/api/sets/:id/copy', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    if (!set || !canView(set, auth)) throw notFound('That question set does not exist.');
    const [row] = await deps.db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: `${set.title} (copy)`.slice(0, 80), description: set.description, subject: set.subject, gradeBand: set.gradeBand, language: set.language, tags: set.tags, visibility: 'private', cover: set.cover, questions: set.questions, questionCount: set.questionCount })
      .returning();
    return { set: summary(row!) };
  });
}
