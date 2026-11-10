import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { questionSchema, type Question } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { answerEvents, gameSessions, questionSets, setEditors, setFavourites, setVersions, users } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { assertUploadsUsable } from '../uploads/service.ts';
import { loadSet, setAccess, validQuestions, type SetRow } from './access.ts';

/*
 * The library around a set: the bin, version history, folders and favourites,
 * private share links and co-editors, statistics from real games, and the
 * question bank. Every route checks who is asking on the server.
 */

export const BIN_DAYS = 30;
export const VERSIONS_KEPT = 20;
const DAY = 86_400_000;

const idParams = z.object({ id: z.string().uuid() });

/** Sets left in the bin longer than 30 days are removed for good (lazily, when their owner next deletes or opens the bin). */
export async function purgeExpired(db: DbOrTx, ownerId: string) {
  await db.delete(questionSets).where(and(eq(questionSets.ownerId, ownerId), isNotNull(questionSets.deletedAt), lt(questionSets.deletedAt, new Date(Date.now() - BIN_DAYS * DAY))));
}

/** Keeps the set as it is now as a version before it changes, and only the last 20. */
export async function recordVersion(db: DbOrTx, set: SetRow, savedBy: string) {
  const snapshot = { title: set.title, description: set.description, subject: set.subject, gradeBand: set.gradeBand, topic: set.topic, language: set.language, tags: set.tags, cover: set.cover, defaults: set.defaults, questions: set.questions };
  await db.insert(setVersions).values({ setId: set.id, savedBy, title: set.title, questionCount: set.questionCount, snapshot });
  const keep = await db.select({ id: setVersions.id }).from(setVersions).where(eq(setVersions.setId, set.id)).orderBy(desc(setVersions.createdAt), desc(setVersions.id)).limit(VERSIONS_KEPT);
  if (keep.length >= VERSIONS_KEPT) await db.delete(setVersions).where(and(eq(setVersions.setId, set.id), notInArray(setVersions.id, keep.map((k) => k.id))));
}

const FOLDER = z
  .string()
  .trim()
  .max(40, 'Keep folder names to 40 characters.')
  .transform((s) => s.replace(/\s+/g, ' '));

async function editableSet(deps: AppDeps, id: string, auth: Parameters<typeof setAccess>[2]) {
  const set = await loadSet(deps.db, id);
  const access = set ? await setAccess(deps.db, set, auth) : null;
  if (!set || !access?.view) throw notFound('That question set does not exist.');
  if (!access.edit) throw forbidden('Only the owner and the co-editors they choose can do that.');
  return { set, access };
}

async function ownedSet(deps: AppDeps, id: string, userId: string) {
  const set = await loadSet(deps.db, id);
  if (!set || set.ownerId !== userId || set.deletedAt) throw notFound('That question set does not exist.');
  return set;
}

export async function libraryRoutes(app: FastifyInstance, deps: AppDeps) {
  const db = deps.db;

  /* ---------------------------------- Bin ---------------------------------- */

  app.get('/api/sets/bin', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    await purgeExpired(db, auth.user.id);
    const rows = await db
      .select({ id: questionSets.id, title: questionSets.title, subject: questionSets.subject, cover: questionSets.cover, questionCount: questionSets.questionCount, deletedAt: questionSets.deletedAt })
      .from(questionSets)
      .where(and(eq(questionSets.ownerId, auth.user.id), isNotNull(questionSets.deletedAt)))
      .orderBy(desc(questionSets.deletedAt));
    return { sets: rows.map((r) => ({ ...r, removeAt: new Date(r.deletedAt!.getTime() + BIN_DAYS * DAY).toISOString() })), days: BIN_DAYS };
  });

  app.post('/api/sets/:id/restore', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const set = await loadSet(db, id);
    if (!set || set.ownerId !== auth.user.id || !set.deletedAt) throw notFound('That set is not in your bin.');
    await db.update(questionSets).set({ deletedAt: null }).where(eq(questionSets.id, id));
    return { ok: true };
  });

  app.delete('/api/sets/:id/forever', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const set = await loadSet(db, id);
    if (!set || set.ownerId !== auth.user.id || !set.deletedAt) throw notFound('That set is not in your bin.');
    await db.delete(questionSets).where(eq(questionSets.id, id));
    return { ok: true };
  });

  /* -------------------------------- Versions -------------------------------- */

  app.get('/api/sets/:id/versions', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await editableSet(deps, id, auth);
    const rows = await db
      .select({ id: setVersions.id, title: setVersions.title, questionCount: setVersions.questionCount, createdAt: setVersions.createdAt, savedBy: users.displayName })
      .from(setVersions)
      .leftJoin(users, eq(users.id, setVersions.savedBy))
      .where(eq(setVersions.setId, id))
      .orderBy(desc(setVersions.createdAt), desc(setVersions.id))
      .limit(VERSIONS_KEPT);
    return { versions: rows };
  });

  app.get('/api/sets/:id/versions/:vid', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id, vid } = parse(z.object({ id: z.string().uuid(), vid: z.coerce.number().int().positive() }), req.params);
    await editableSet(deps, id, auth);
    const [v] = await db.select().from(setVersions).where(and(eq(setVersions.id, vid), eq(setVersions.setId, id))).limit(1);
    if (!v) throw notFound('That version is no longer kept.');
    const snap = v.snapshot as Record<string, unknown>;
    return { version: { id: v.id, createdAt: v.createdAt, title: v.title, questions: validQuestions({ questions: snap.questions }) } };
  });

  app.post('/api/sets/:id/versions/:vid/restore', async (req) => {
    const auth = requireAccount(req);
    const { id, vid } = parse(z.object({ id: z.string().uuid(), vid: z.coerce.number().int().positive() }), req.params);
    const { set } = await editableSet(deps, id, auth);
    const [v] = await db.select().from(setVersions).where(and(eq(setVersions.id, vid), eq(setVersions.setId, id))).limit(1);
    if (!v) throw notFound('That version is no longer kept.');
    const snap = v.snapshot as Record<string, unknown>;
    const questions = validQuestions({ questions: snap.questions });
    if (!questions.length) throw badRequest('That version has no questions that can still be used.');
    await assertUploadsUsable(db, questions);
    await db.transaction(async (tx) => {
      // The set as it is now becomes a version too, so a restore can be undone.
      await recordVersion(tx, set, auth.user.id);
      await tx
        .update(questionSets)
        .set({ title: String(snap.title ?? set.title).slice(0, 80), description: String(snap.description ?? ''), questions, questionCount: questions.length, updatedAt: new Date() })
        .where(eq(questionSets.id, id));
    });
    return { ok: true };
  });

  /* ------------------------- Folders and favourites ------------------------- */

  app.patch('/api/sets/:id/organise', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ folder: FOLDER.nullable().optional(), favourite: z.boolean().optional() }), req.body);
    const set = await loadSet(db, id);
    const access = set ? await setAccess(db, set, auth) : null;
    if (!set || !access?.view) throw notFound('That question set does not exist.');
    if (body.folder !== undefined) {
      // Folders are the owner's own way of keeping their library.
      if (!access.owner) throw forbidden('Only the owner can put a set in a folder.');
      await db.update(questionSets).set({ folder: body.folder || null }).where(eq(questionSets.id, id));
    }
    if (body.favourite === true) await db.insert(setFavourites).values({ userId: auth.user.id, setId: id }).onConflictDoNothing();
    if (body.favourite === false) await db.delete(setFavourites).where(and(eq(setFavourites.userId, auth.user.id), eq(setFavourites.setId, id)));
    return { ok: true };
  });

  /* ------------------------ Share links and co-editors ----------------------- */

  app.post('/api/sets/:id/share-link', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await ownedSet(deps, id, auth.user.id);
    const token = randomBytes(18).toString('base64url');
    await db.update(questionSets).set({ shareToken: token }).where(eq(questionSets.id, id));
    return { token };
  });

  app.delete('/api/sets/:id/share-link', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await ownedSet(deps, id, auth.user.id);
    await db.update(questionSets).set({ shareToken: null }).where(eq(questionSets.id, id));
    return { ok: true };
  });

  const tokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,40}$/) });
  const byToken = async (token: string) => {
    const [set] = await db.select().from(questionSets).where(and(eq(questionSets.shareToken, token), isNull(questionSets.deletedAt), isNull(questionSets.hiddenAt))).limit(1);
    if (!set) throw notFound('This share link has been turned off, or the set was deleted. Ask for a new link.');
    return set;
  };

  /** A teacher with the link sees the whole set, answers included, so they can decide to copy it. */
  app.get('/api/sets/shared/:token', async (req, reply) => {
    noStore(reply);
    requireAccount(req);
    const { token } = parse(tokenParams, req.params);
    const set = await byToken(token);
    const [owner] = set.ownerId ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, set.ownerId)).limit(1) : [];
    return { set: { id: set.id, title: set.title, description: set.description, subject: set.subject, gradeBand: set.gradeBand, topic: set.topic, cover: set.cover, questionCount: set.questionCount, ownerName: owner?.name ?? null }, questions: validQuestions(set) };
  });

  app.post('/api/sets/shared/:token/copy', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { token } = parse(tokenParams, req.params);
    const set = await byToken(token);
    const [owned] = (await db.select({ n: sql<number>`count(*)::int` }).from(questionSets).where(eq(questionSets.ownerId, auth.user.id))) as [{ n: number }];
    if (owned.n >= 500) throw new AppError(409, 'conflict', 'You have reached the limit of 500 sets. Delete some you no longer use, and empty the bin.');
    const [row] = await db
      .insert(questionSets)
      .values({ ownerId: auth.user.id, title: `${set.title} (copy)`.slice(0, 80), description: set.description, subject: set.subject, gradeBand: set.gradeBand, topic: set.topic, language: set.language, tags: set.tags, visibility: 'private', cover: set.cover, defaults: set.defaults, questions: set.questions, questionCount: set.questionCount })
      .returning({ id: questionSets.id, title: questionSets.title });
    return { set: row };
  });

  app.get('/api/sets/:id/editors', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    await ownedSet(deps, id, auth.user.id);
    const rows = await db
      .select({ userId: setEditors.userId, displayName: users.displayName, username: users.username, addedAt: setEditors.createdAt })
      .from(setEditors)
      .innerJoin(users, eq(users.id, setEditors.userId))
      .where(eq(setEditors.setId, id))
      .orderBy(asc(setEditors.createdAt));
    return { editors: rows };
  });

  app.post('/api/sets/:id/editors', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const { username } = parse(z.object({ username: z.string().trim().min(1, 'Type their username.').max(40) }), req.body);
    await ownedSet(deps, id, auth.user.id);
    const [user] = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username, accountType: users.accountType, isGuest: users.isGuest, status: users.status })
      .from(users)
      .where(eq(users.username, username.replace(/^@/, '').toLowerCase()))
      .limit(1);
    // The same answer for "no such user" and "not a teacher", so the form cannot be used to look up students.
    if (!user || user.isGuest || user.accountType !== 'teacher' || user.status !== 'active') throw notFound('No teacher account has that username. Check the spelling, and ask them to switch to a teacher account in Settings if they have not.');
    if (user.id === auth.user.id) throw badRequest('You already own this set.');
    const [count] = (await db.select({ n: sql<number>`count(*)::int` }).from(setEditors).where(eq(setEditors.setId, id))) as [{ n: number }];
    if (count.n >= 10) throw new AppError(409, 'conflict', 'A set can have up to 10 co-editors.');
    await db.insert(setEditors).values({ setId: id, userId: user.id, addedBy: auth.user.id }).onConflictDoNothing();
    return { editor: { userId: user.id, displayName: user.displayName, username: user.username } };
  });

  app.delete('/api/sets/:id/editors/:userId', async (req) => {
    const auth = requireAccount(req);
    const { id, userId } = parse(z.object({ id: z.string().uuid(), userId: z.string().uuid() }), req.params);
    const set = await loadSet(db, id);
    // The owner can remove anyone; a co-editor can take themselves off.
    if (!set || set.deletedAt || (set.ownerId !== auth.user.id && userId !== auth.user.id)) throw notFound('That question set does not exist.');
    await db.delete(setEditors).where(and(eq(setEditors.setId, id), eq(setEditors.userId, userId)));
    return { ok: true };
  });

  /* ------------------------------- Statistics ------------------------------- */

  app.get('/api/sets/:id/stats', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const { set } = await editableSet(deps, id, auth);
    const [games] = (await db.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${gameSessions.endedAt})` }).from(gameSessions).where(eq(gameSessions.setId, id))) as [{ n: number; last: Date | null }];
    // Self-graded flashcards say little about accuracy, so they are left out, as in reports.
    const per = await db
      .select({ questionId: answerEvents.questionId, answers: sql<number>`count(*)::int`, credit: sql<number>`sum(case when ${answerEvents.correct} then 1 else ${answerEvents.partial} end)::float` })
      .from(answerEvents)
      .where(and(eq(answerEvents.setId, id), inArray(answerEvents.kind, ['answer', 'attempt'])))
      .groupBy(answerEvents.questionId);
    const questions = validQuestions(set);
    const byId = new Map(questions.map((q, i) => [q.id, { q, i }]));
    const rows = per
      .filter((r) => byId.has(r.questionId))
      .map((r) => ({ questionId: r.questionId, number: byId.get(r.questionId)!.i + 1, prompt: byId.get(r.questionId)!.q.prompt, type: byId.get(r.questionId)!.q.type, answers: r.answers, accuracy: r.answers ? r.credit / r.answers : 0 }));
    const answers = rows.reduce((n, r) => n + r.answers, 0);
    const credit = rows.reduce((n, r) => n + r.accuracy * r.answers, 0);
    return {
      plays: set.plays,
      games: games.n,
      lastPlayed: games.last,
      answers,
      accuracy: answers ? credit / answers : null,
      // The hardest questions: the lowest share right, among those answered at least 3 times.
      hardest: rows.filter((r) => r.answers >= 3).sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers).slice(0, 5),
      questions: rows.sort((a, b) => a.number - b.number),
    };
  });

  /* ------------------------------ Question bank ----------------------------- */

  app.get('/api/sets/bank', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const q = parse(z.object({ q: z.string().trim().max(80).default(''), type: z.string().trim().max(20).optional(), exclude: z.string().uuid().optional() }), req.query);
    const sets = await db
      .select({ id: questionSets.id, title: questionSets.title, questions: questionSets.questions })
      .from(questionSets)
      .where(and(eq(questionSets.ownerId, auth.user.id), isNull(questionSets.deletedAt)))
      .orderBy(desc(questionSets.updatedAt))
      .limit(500);
    const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    const results: { setId: string; setTitle: string; question: Question }[] = [];
    for (const s of sets) {
      if (s.id === q.exclude) continue;
      for (const question of validQuestions(s)) {
        if (q.type && question.type !== q.type) continue;
        const hay = JSON.stringify(question).toLowerCase();
        if (words.every((w) => hay.includes(w))) results.push({ setId: s.id, setTitle: s.title, question });
        if (results.length >= 60) break;
      }
      if (results.length >= 60) break;
    }
    return { results, more: results.length >= 60 };
  });

  /** Copy or move questions into another set the asker can edit. A move takes them out of this set. */
  app.post('/api/sets/:id/questions/transfer', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ to: z.string().uuid(), questionIds: z.array(z.string().max(40)).min(1).max(250), mode: z.enum(['copy', 'move']) }), req.body);
    if (body.to === id) throw badRequest('Choose a different set.');
    const { set: from } = await editableSet(deps, id, auth);
    const { set: to } = await editableSet(deps, body.to, auth);
    const picked = validQuestions(from).filter((q) => body.questionIds.includes(q.id));
    if (!picked.length) throw badRequest('Those questions are not in this set any more. Save your changes first.');
    const target = validQuestions(to);
    const taken = new Set(target.map((q) => q.id));
    const fresh = picked.map((q) => {
      let qid = q.id;
      while (taken.has(qid)) qid = `q${randomBytes(4).toString('hex')}`;
      taken.add(qid);
      return questionSchema.parse({ ...q, id: qid });
    });
    if (target.length + fresh.length > 250) throw badRequest(`${to.title} would have more than 250 questions.`);
    const remaining = validQuestions(from).filter((q) => !body.questionIds.includes(q.id));
    if (body.mode === 'move' && !remaining.length) throw badRequest('A set needs at least one question, so copy them instead, or delete the set.');
    await db.transaction(async (tx) => {
      await recordVersion(tx, to, auth.user.id);
      await tx.update(questionSets).set({ questions: [...target, ...fresh], questionCount: target.length + fresh.length, updatedAt: new Date() }).where(eq(questionSets.id, to.id));
      if (body.mode === 'move') {
        await recordVersion(tx, from, auth.user.id);
        await tx.update(questionSets).set({ questions: remaining, questionCount: remaining.length, updatedAt: new Date() }).where(eq(questionSets.id, from.id));
      }
    });
    return { ok: true, count: fresh.length, to: { id: to.id, title: to.title } };
  });
}
