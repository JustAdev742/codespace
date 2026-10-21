import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getMode, getVariant } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { answerEvents, classes, gameParticipants, gameSessions, questionSets } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadSet } from '../sets/access.ts';
import { questionReport, questionsById } from './report.ts';

const modeTitle = (modeId: string, variantId: string | null) => (variantId ? getVariant(variantId)?.meta.title : null) ?? getMode(modeId)?.meta.title ?? modeId;

/*
 * Reports for hosts and teachers, and a player's own statistics. A game
 * report is for the person who hosted it, the teacher of the class it was
 * played in, or staff who can look up accounts. Players get their own
 * numbers only.
 */
export async function analyticsRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/games/:id/report', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [g] = await db.select().from(gameSessions).where(eq(gameSessions.id, id)).limit(1);
    if (!g) throw notFound('That game does not exist.');
    let allowed = g.hostUserId === auth.user.id || auth.permissions.has('users.read');
    if (!allowed && g.classId) {
      const [cls] = await db.select({ ownerId: classes.ownerId }).from(classes).where(eq(classes.id, g.classId)).limit(1);
      allowed = cls?.ownerId === auth.user.id;
    }
    if (!allowed) throw notFound('That game does not exist.');
    const standings = await db.select().from(gameParticipants).where(eq(gameParticipants.gameId, id)).orderBy(gameParticipants.rank);
    const set = g.setId ? await loadSet(db, g.setId) : null;
    return {
      game: { id: g.id, mode: modeTitle(g.modeId, g.variantId), modeId: g.modeId, variantId: g.variantId, setTitle: g.setTitle, setId: g.setId, startedAt: g.startedAt.toISOString(), endedAt: g.endedAt.toISOString(), durationMs: g.durationMs, players: g.playerCount, endedBy: g.endedBy, solo: g.isSolo },
      standings: standings.map((s) => ({ rank: s.rank, name: s.displayName, isGuest: s.isGuest, isBot: s.isBot, score: s.score, label: s.label, correct: s.correct, answered: s.answered, avgResponseMs: s.avgResponseMs, bestStreak: s.bestStreak, leftEarly: s.leftEarly })),
      questions: await questionReport(db, [id], set),
    };
  });

  /** Games you hosted, newest first, for opening their reports. */
  app.get('/api/me/hosted', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.iso.datetime({ offset: true }).optional() }), req.query);
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.hostUserId, auth.user.id), eq(gameSessions.isSolo, false), q.before ? lt(gameSessions.endedAt, new Date(q.before)) : sql`true`))
      .orderBy(desc(gameSessions.endedAt))
      .limit(31);
    return {
      games: rows.slice(0, 30).map((g) => ({ id: g.id, mode: modeTitle(g.modeId, g.variantId), setTitle: g.setTitle, players: g.playerCount, endedAt: g.endedAt.toISOString(), durationMs: g.durationMs })),
      nextBefore: rows.length > 30 ? rows[29]!.endedAt.toISOString() : null,
    };
  });

  /** Your own numbers: by mode, by subject, week by week, and questions worth another look. */
  app.get('/api/me/stats', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const me = auth.user.id;
    const since8w = new Date(Date.now() - 8 * 7 * 86_400_000);
    const since30d = new Date(Date.now() - 30 * 86_400_000);
    const [byMode, bySubject, weekly, misses] = await Promise.all([
      db
        .select({ modeId: gameSessions.modeId, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${gameParticipants.correct})::int`, answered: sql<number>`sum(${gameParticipants.answered})::int`, wins: sql<number>`sum(case when ${gameParticipants.rank} = 1 and ${gameSessions.playerCount} >= 3 then 1 else 0 end)::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(eq(gameParticipants.userId, me))
        .groupBy(gameSessions.modeId)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ subject: questionSets.subject, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${gameParticipants.correct})::int`, answered: sql<number>`sum(${gameParticipants.answered})::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .innerJoin(questionSets, eq(questionSets.id, gameSessions.setId))
        .where(eq(gameParticipants.userId, me))
        .groupBy(questionSets.subject)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ week: sql<string>`to_char(date_trunc('week', ${gameSessions.endedAt}), 'YYYY-MM-DD')`, games: sql<number>`count(*)::int`, correct: sql<number>`sum(${gameParticipants.correct})::int`, answered: sql<number>`sum(${gameParticipants.answered})::int` })
        .from(gameParticipants)
        .innerJoin(gameSessions, eq(gameSessions.id, gameParticipants.gameId))
        .where(and(eq(gameParticipants.userId, me), gte(gameSessions.endedAt, since8w)))
        .groupBy(sql`date_trunc('week', ${gameSessions.endedAt})`)
        .orderBy(sql`date_trunc('week', ${gameSessions.endedAt})`),
      db
        .select({ setId: answerEvents.setId, questionId: answerEvents.questionId, at: sql<Date>`max(${answerEvents.createdAt})` })
        .from(answerEvents)
        .where(and(eq(answerEvents.userId, me), eq(answerEvents.correct, false), eq(answerEvents.kind, 'answer'), gte(answerEvents.createdAt, since30d)))
        .groupBy(answerEvents.setId, answerEvents.questionId)
        .orderBy(desc(sql`max(${answerEvents.createdAt})`))
        .limit(12),
    ]);
    const setIds = [...new Set(misses.map((m) => m.setId).filter((x): x is string => Boolean(x)))];
    const sets = setIds.length ? await db.select().from(questionSets).where(inArray(questionSets.id, setIds)) : [];
    const practise = misses
      .map((m) => {
        const set = sets.find((s) => s.id === m.setId);
        if (!set || set.hiddenAt) return null;
        const q = questionsById(set).get(m.questionId);
        return q ? { setId: set.id, setTitle: set.title, questionId: q.id, prompt: q.prompt, at: new Date(m.at).toISOString() } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    return {
      byMode: byMode.map((r) => ({ modeId: r.modeId, mode: modeTitle(r.modeId, null), games: r.games, correct: r.correct ?? 0, answered: r.answered ?? 0, wins: r.wins ?? 0 })),
      bySubject: bySubject.map((r) => ({ subject: r.subject, games: r.games, correct: r.correct ?? 0, answered: r.answered ?? 0 })),
      weekly: weekly.map((r) => ({ weekOf: r.week, games: r.games, correct: r.correct ?? 0, answered: r.answered ?? 0 })),
      practise,
    };
  });
}
