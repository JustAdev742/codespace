import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { questionSetInputSchema, SUBJECTS, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { assignments, questionSets, setEditors, setFavourites, users } from '../../db/schema.ts';
import { noStore, requireAccount, requireAuth, requirePermission } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadSet, setAccess, validQuestions, type SetRow } from './access.ts';
import { assertUploadsUsable } from '../uploads/service.ts';
import { withOperation } from '../economy/service.ts';
import { checkAchievements } from '../progression/achievements.ts';
import { libraryRoutes, purgeExpired, recordVersion } from './library.ts';

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  subject: z.enum(SUBJECTS).optional(),
  scope: z.enum(['public', 'mine', 'official', 'featured', 'shared']).default('public'),
  /** Year level (stored as gradeBand) and topic, exact match. */
  year: z.string().trim().max(30).optional(),
  topic: z.string().trim().max(60).optional(),
  /** My sets only: a folder by name, '-' for sets in no folder, and favourites. */
  folder: z.string().trim().max(40).optional(),
  favourites: z.enum(['1']).optional(),
  tag: z.string().trim().max(30).optional(),
  sort: z.enum(['recent', 'title', 'plays']).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

export function summary(s: SetRow & { ownerName?: string | null }, extra?: { favourite?: boolean }) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    subject: s.subject,
    gradeBand: s.gradeBand,
    topic: s.topic,
    language: s.language,
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
    defaults: s.defaults ?? null,
    ...(extra?.favourite !== undefined ? { favourite: extra.favourite } : {}),
  };
}

/** For people who cannot edit a set: prompts and choice texts, never which answer is right. */
function preview(questions: Question[], limit: number) {
  return questions.slice(0, limit).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.type === 'mcq' || q.type === 'multi' || q.type === 'poll' ? { choices: q.choices.map((c) => c.text) } : {}),
  }));
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function setRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/sets', async (req, reply) => {
    noStore(reply);
    const q = parse(listQuery, req.query);
    const conds: (SQL | undefined)[] = [isNull(questionSets.hiddenAt), isNull(questionSets.deletedAt)];
    let me: string | null = null;
    if (q.scope === 'mine' || q.scope === 'shared') {
      const auth = requireAuth(req);
      me = auth.user.id;
      conds.length = 0;
      conds.push(isNull(questionSets.deletedAt));
      if (q.scope === 'mine') conds.push(eq(questionSets.ownerId, me));
      else conds.push(sql`${questionSets.id} in (select ${setEditors.setId} from ${setEditors} where ${setEditors.userId} = ${me})`, isNull(questionSets.hiddenAt));
      if (q.folder === '-') conds.push(isNull(questionSets.folder));
      else if (q.folder) conds.push(eq(questionSets.folder, q.folder));
      if (q.favourites) conds.push(sql`${questionSets.id} in (select ${setFavourites.setId} from ${setFavourites} where ${setFavourites.userId} = ${me})`);
    } else if (q.scope === 'official') conds.push(eq(questionSets.isOfficial, true), eq(questionSets.visibility, 'public'));
    else if (q.scope === 'featured') conds.push(eq(questionSets.visibility, 'public'), or(eq(questionSets.isFeatured, true), eq(questionSets.isOfficial, true)));
    else conds.push(eq(questionSets.visibility, 'public'));
    if (q.subject) conds.push(eq(questionSets.subject, q.subject));
    if (q.year) conds.push(eq(questionSets.gradeBand, q.year));
    if (q.topic) conds.push(ilike(questionSets.topic, likeEscape(q.topic)));
    if (q.tag) conds.push(sql`${q.tag} = any(${questionSets.tags})`);
    if (q.q) {
      const words = q.q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
      const tsq = words.map((w) => `${w}:*`).join(' & ');
      const like = `%${likeEscape(q.q)}%`;
      conds.push(tsq ? or(sql`${questionSets.search} @@ to_tsquery('simple', ${tsq})`, ilike(questionSets.title, like), ilike(questionSets.topic, like)) : or(ilike(questionSets.title, like), ilike(questionSets.topic, like)));
    }
    const where = and(...conds);
    const order =
      q.sort === 'title'
        ? [asc(sql`lower(${questionSets.title})`), desc(questionSets.updatedAt)]
        : q.sort === 'plays'
          ? [desc(questionSets.plays), desc(questionSets.updatedAt)]
          : q.sort === 'recent' || me
            ? [desc(questionSets.updatedAt)]
            : [desc(questionSets.isFeatured), desc(questionSets.isOfficial), desc(questionSets.plays), desc(questionSets.updatedAt)];
    const rows = await deps.db
      .select({ s: questionSets, ownerName: users.displayName })
      .from(questionSets)
      .leftJoin(users, eq(users.id, questionSets.ownerId))
      .where(where)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ n }] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(where)) as [{ n: number }];
    let favs = new Set<string>();
    if (me && rows.length) {
      const f = await deps.db.select({ id: setFavourites.setId }).from(setFavourites).where(and(eq(setFavourites.userId, me), inArray(setFavourites.setId, rows.map((r) => r.s.id))));
      favs = new Set(f.map((x) => x.id));
    }
    return {
      sets: rows.map((r) => ({ ...summary({ ...r.s, ownerName: r.ownerName }, me ? { favourite: favs.has(r.s.id) } : undefined), ...(q.scope === 'mine' ? { folder: r.s.folder } : {}) })),
      total: n,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  /** The owner's folders and tags, for the library's filters. */
  app.get('/api/sets/organise', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const mine = and(eq(questionSets.ownerId, auth.user.id), isNull(questionSets.deletedAt));
    const folders = await deps.db
      .select({ name: questionSets.folder, n: sql<number>`count(*)::int` })
      .from(questionSets)
      .where(and(mine, isNotNull(questionSets.folder)))
      .groupBy(questionSets.folder)
      .orderBy(asc(questionSets.folder));
    const tags = await deps.db.execute<{ tag: string; n: number }>(sql`select t as tag, count(*)::int as n from ${questionSets}, unnest(${questionSets.tags}) as t where ${mine} group by t order by lower(t) limit 50`);
    const [fav] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(setFavourites).innerJoin(questionSets, eq(questionSets.id, setFavourites.setId)).where(and(eq(setFavourites.userId, auth.user.id), isNull(questionSets.deletedAt)))) as [{ n: number }];
    const [shared] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(setEditors).innerJoin(questionSets, eq(questionSets.id, setEditors.setId)).where(and(eq(setEditors.userId, auth.user.id), isNull(questionSets.deletedAt)))) as [{ n: number }];
    return { folders: folders.map((f) => ({ name: f.name!, count: f.n })), tags: tags.rows.map((t) => ({ name: t.tag, count: Number(t.n) })), favourites: fav.n, shared: shared.n };
  });

  app.get('/api/sets/:id', async (req, reply) => {
    noStore(reply);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    const access = set ? await setAccess(deps.db, set, req.auth) : null;
    if (!set || !access?.view) throw notFound('That question set does not exist or is private.');
    const questions = validQuestions(set);
    const [owner] = set.ownerId ? await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, set.ownerId)).limit(1) : [];
    let favourite: boolean | undefined;
    if (req.auth) {
      const f = await deps.db.select({ id: setFavourites.setId }).from(setFavourites).where(and(eq(setFavourites.userId, req.auth.user.id), eq(setFavourites.setId, id))).limit(1);
      favourite = f.length > 0;
    }
    return {
      set: { ...summary({ ...set, ownerName: owner?.name ?? null }, favourite === undefined ? undefined : { favourite }), ...(access.owner ? { folder: set.folder, shareToken: set.shareToken } : {}) },
      editable: access.edit,
      owner: access.owner,
      questions: access.edit ? questions : null,
      preview: access.edit ? null : preview(questions, 6),
      typeCounts: questions.reduce<Record<string, number>>((acc, q) => ((acc[q.type] = (acc[q.type] ?? 0) + 1), acc), {}),
    };
  });

  const checkVisibility = (visibility: string, auth: { permissions: Set<string> }) => {
    if (visibility === 'public' && !auth.permissions.has('sets.publish_public')) {
      throw new AppError(403, 'forbidden', 'Publishing sets to the public library needs a trusted account. You can share it with a link by making it unlisted.');
    }
  };

  /** A public set must describe every picture, so players who cannot see it are not left out. */
  const checkDescriptions = (visibility: string, questions: Question[]) => {
    if (visibility !== 'public') return;
    const missing = questions.findIndex((q) => (q.media && !q.media.alt.trim()) || ((q.type === 'mcq' || q.type === 'multi' || q.type === 'poll') && q.choices.some((c) => c.media && !c.media.alt.trim())));
    if (missing >= 0) throw new AppError(400, 'bad_request', `Question ${missing + 1} has a picture with no description. Describe every picture before you publish the set to the library.`, { [`questions.${missing}.media`]: 'Describe this picture for players who cannot see it.' });
  };

  app.post('/api/sets', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requirePermission(req, 'sets.create');
    requireAccount(req);
    const body = parse(questionSetInputSchema, req.body);
    checkVisibility(body.visibility, auth);
    checkDescriptions(body.visibility, body.questions);
    await assertUploadsUsable(deps.db, body.questions);
    const [owned] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id))) as [{ n: number }];
    if (owned.n >= 500) throw new AppError(409, 'conflict', 'You have reached the limit of 500 sets. Delete some you no longer use, and empty the bin.');
    const [row] = await deps.db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: body.title, description: body.description, subject: body.subject, gradeBand: body.gradeBand ?? null, topic: body.topic ?? null, language: body.language, tags: body.tags, visibility: body.visibility, cover: body.cover ?? null, defaults: body.defaults ?? null, questions: body.questions, questionCount: body.questions.length })
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
    const access = set ? await setAccess(deps.db, set, auth) : null;
    if (!set || !access?.view) throw notFound('That question set does not exist.');
    if (!access.edit) throw forbidden('Only the owner and the co-editors they choose can edit this set. Make a copy to change it.');
    const body = parse(questionSetInputSchema, req.body);
    // Who can see a set is the owner's call; a co-editor's save keeps it as it is.
    const visibility = access.owner ? body.visibility : set.visibility;
    if (visibility !== set.visibility) checkVisibility(visibility, auth);
    checkDescriptions(visibility, body.questions);
    await assertUploadsUsable(deps.db, body.questions);
    const row = await deps.db.transaction(async (tx) => {
      await recordVersion(tx, set, auth.user.id);
      const [updated] = await tx
        .update(questionSets)
        .set({ title: body.title, description: body.description, subject: body.subject, gradeBand: body.gradeBand ?? null, topic: body.topic ?? null, language: body.language, tags: body.tags, visibility, cover: body.cover ?? null, defaults: body.defaults ?? null, questions: body.questions, questionCount: body.questions.length, updatedAt: new Date() })
        .where(eq(questionSets.id, id))
        .returning();
      return updated!;
    });
    return { set: summary(row) };
  });

  /** Deleting puts a set in the bin, where it can be restored for 30 days. */
  app.delete('/api/sets/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    if (!set || set.ownerId !== auth.user.id || set.deletedAt) throw notFound('That question set does not exist.');
    // Deleting would take class assignments with it in 30 days (the database cascades), so ask first.
    const [used] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(assignments).where(eq(assignments.setId, id));
    if ((used?.n ?? 0) > 0) {
      throw conflict(`${used!.n === 1 ? 'A class assignment uses' : `${used!.n} class assignments use`} this set. Remove ${used!.n === 1 ? 'it' : 'them'} from the class first, or make the set private instead.`);
    }
    await deps.db.update(questionSets).set({ deletedAt: new Date(), shareToken: null }).where(eq(questionSets.id, id));
    await purgeExpired(deps.db, auth.user.id);
    return { ok: true, binnedUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() };
  });

  app.post('/api/sets/:id/copy', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const set = await loadSet(deps.db, id);
    const access = set ? await setAccess(deps.db, set, auth) : null;
    if (!set || !access?.view) throw notFound('That question set does not exist.');
    const [owned] = (await deps.db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id))) as [{ n: number }];
    if (owned.n >= 500) throw new AppError(409, 'conflict', 'You have reached the limit of 500 sets. Delete some you no longer use, and empty the bin.');
    const [row] = await deps.db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: `${set.title} (copy)`.slice(0, 80), description: set.description, subject: set.subject, gradeBand: set.gradeBand, topic: set.topic, language: set.language, tags: set.tags, visibility: 'private', cover: set.cover, defaults: set.defaults, questions: set.questions, questionCount: set.questionCount, folder: access.owner ? set.folder : null })
      .returning();
    return { set: summary(row!) };
  });

  await libraryRoutes(app, deps);
}
