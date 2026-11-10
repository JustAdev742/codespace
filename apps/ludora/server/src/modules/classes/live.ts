import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getMode, getVariant } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { classMembers, gameParticipants, gameSessions, users } from '../../db/schema.ts';
import { noStore, requireAccount } from '../../http/context.ts';
import { parse } from '../../lib/validate.ts';
import { teacherClass } from './access.ts';

/*
 * Live games hosted for a class (from the class page, members only) and who took part in each:
 * the class's attendance. For the class's teacher only; students get a 403, everyone else a 404.
 * Attendance is read from the saved game's participants, so it is what the server recorded.
 */
export async function classLiveRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  app.get('/api/classes/:id/live-games', async (req, reply) => {
    noStore(reply);
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const cls = await teacherClass(db, id, auth, 'Only the teacher can see attendance for class games.');
    const games = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.classId, cls.id), isNull(gameSessions.assignmentId), eq(gameSessions.isSolo, false)))
      .orderBy(desc(gameSessions.endedAt))
      .limit(20);
    const members = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.userId))
      .where(eq(classMembers.classId, cls.id))
      .orderBy(users.displayName);
    const rows = games.length
      ? await db
          .select({ gameId: gameParticipants.gameId, userId: gameParticipants.userId, correct: gameParticipants.correct, answered: gameParticipants.answered })
          .from(gameParticipants)
          .where(and(inArray(gameParticipants.gameId, games.map((g) => g.id)), eq(gameParticipants.isBot, false)))
      : [];
    return {
      games: games.map((g) => {
        const took = new Map(rows.filter((r) => r.gameId === g.id && r.userId).map((r) => [r.userId!, r]));
        return {
          id: g.id,
          mode: (g.variantId ? getVariant(g.variantId)?.meta.title : null) ?? getMode(g.modeId)?.meta.title ?? g.modeId,
          setTitle: g.setTitle,
          endedAt: g.endedAt.toISOString(),
          present: members.filter((m) => took.has(m.id)).map((m) => ({ id: m.id, displayName: m.displayName, correct: took.get(m.id)!.correct, answered: took.get(m.id)!.answered })),
          absent: members.filter((m) => !took.has(m.id)).map((m) => ({ id: m.id, displayName: m.displayName })),
        };
      }),
    };
  });
}
