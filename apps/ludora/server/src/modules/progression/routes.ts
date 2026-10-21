import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import { achievements, userAchievements } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { parse } from '../../lib/validate.ts';
import { claimQuest, ensureQuests } from './quests.ts';
import { metricValues } from './achievements.ts';

export async function progressionRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/quests', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = await ensureQuests(deps.db, auth.user.id);
    return {
      resets: q.resets,
      events: q.events,
      quests: q.rows.map(({ uq, q: quest }) => ({ id: quest.id, kind: quest.kind, title: quest.title, description: quest.description, progress: uq.progress, target: uq.target, period: uq.period, completed: Boolean(uq.completedAt), claimed: Boolean(uq.claimedAt), reward: quest.reward })),
    };
  });

  app.post('/api/quests/:id/claim', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(60) }), req.params);
    const { period } = parse(z.object({ period: z.string().regex(/^(?:[a-z_]{2,32}:)?\d{4}-(\d{2}-\d{2}|W\d{2})$/) }), req.body);
    const { result } = await claimQuest(deps.db, auth.user.id, id, period);
    return result;
  });

  app.get('/api/achievements', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [all, mine, values] = await Promise.all([
      deps.db.select().from(achievements).orderBy(achievements.sort),
      deps.db.select().from(userAchievements).where(eq(userAchievements.userId, auth.user.id)),
      metricValues(deps.db, auth.user.id),
    ]);
    const unlocked = new Map(mine.map((m) => [m.achievementId, m.unlockedAt]));
    const secretLeft = all.filter((a) => a.secret && !unlocked.has(a.id)).length;
    return {
      achievements: all
        .filter((a) => !a.secret || unlocked.has(a.id))
        .map((a) => ({ id: a.id, title: a.title, description: a.description, metric: a.metric, target: a.target, progress: Math.min(a.target, values[a.metric] ?? 0), reward: a.reward, tier: a.tier, hue: a.hue, unlockedAt: unlocked.get(a.id) ?? null })),
      secretLeft,
    };
  });
}
