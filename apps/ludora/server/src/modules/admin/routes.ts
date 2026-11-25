import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../app.ts';
import { adminCatalogRoutes } from './catalog.ts';
import { adminCleanupRoutes } from './cleanup.ts';
import { adminEconomyRoutes } from './economy.ts';
import { economyRoomRoutes } from './economyRoom.ts';
import { adminLiveRoutes } from './live.ts';
import { adminSeasonRoutes } from './season.ts';
import { moderationRoutes } from './moderation.ts';
import { adminTestingRoutes } from './testing.ts';
import { adminUserRoutes } from './users.ts';

/** Every staff endpoint lives under /api/admin and checks its own permission on the server. */
export async function adminRoutes(app: FastifyInstance, deps: AppDeps) {
  await adminUserRoutes(app, deps);
  await adminEconomyRoutes(app, deps);
  await adminCleanupRoutes(app, deps);
  await economyRoomRoutes(app, deps);
  await adminCatalogRoutes(app, deps);
  await adminSeasonRoutes(app, deps);
  await moderationRoutes(app, deps);
  await adminLiveRoutes(app, deps);
  await adminTestingRoutes(app, deps);
}
