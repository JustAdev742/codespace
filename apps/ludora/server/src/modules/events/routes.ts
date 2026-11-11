import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.ts';
import { currentSeason } from './season.ts';
import { schoolEventRoutes } from './school.ts';
import { schoolRoutes } from '../school/routes.ts';
import { competeRoutes } from '../school/compete.ts';

export async function eventRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Today's season and celebration, in Sydney time, for dressing the site. Public: it is the same for everyone. */
  app.get('/api/season', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return currentSeason(deps.db);
  });

  // A school's own copy: notices and events here, houses and competitions in modules/school.
  await schoolEventRoutes(app, deps);
  await schoolRoutes(app, deps);
  await competeRoutes(app, deps);
}
