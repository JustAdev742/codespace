import type { RouteModule } from './app.ts';
import { roomRoutes } from './modules/rooms/routes.ts';
import { profileRoutes } from './modules/profiles/routes.ts';
import { modeRoutes } from './modules/modes/routes.ts';
import { setRoutes } from './modules/sets/routes.ts';
import { progressionRoutes } from './modules/progression/routes.ts';
import { systemRoutes } from './modules/system/routes.ts';
import { shopRoutes } from './modules/shop/routes.ts';
import { adminRoutes } from './modules/admin/routes.ts';
import { socialRoutes } from './modules/social/routes.ts';
import { classRoutes } from './modules/classes/routes.ts';
import { analyticsRoutes } from './modules/analytics/routes.ts';
import { uploadRoutes } from './modules/uploads/routes.ts';
import { aiRoutes } from './modules/ai/routes.ts';
import { chaosRoutes } from './modules/chaos/routes.ts';
import { eventRoutes } from './modules/events/routes.ts';

/** Every HTTP route module, in registration order. Auth and health are registered by buildApp itself. */
export const allRoutes: RouteModule[] = [roomRoutes, profileRoutes, modeRoutes, setRoutes, progressionRoutes, systemRoutes, shopRoutes, socialRoutes, classRoutes, analyticsRoutes, uploadRoutes, aiRoutes, chaosRoutes, eventRoutes, adminRoutes];
