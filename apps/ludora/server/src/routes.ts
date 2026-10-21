import type { RouteModule } from './app.ts';
import { roomRoutes } from './modules/rooms/routes.ts';

/** Every HTTP route module, in registration order. Auth and health are registered by buildApp itself. */
export const allRoutes: RouteModule[] = [roomRoutes];
