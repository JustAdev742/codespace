import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.ts';
import { currentSeason } from './season.ts';

export async function eventRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Today's season and celebration, in Sydney time, for dressing the site. Public: it is the same for everyone. */
  app.get('/api/season', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return currentSeason(deps.db);
  });
}
