import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { registerAuthHook, registerCsrfGuard, registerErrorHandler } from './http/plugins.ts';
import { notApi, requestKey } from './http/limits.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { RoomManager } from './realtime/manager.ts';
import { scheduleRetention } from './modules/users/retention.ts';
import type { QuestionDrafter } from './modules/ai/drafter.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  pool: pg.Pool;
  log?: FastifyBaseLogger;
  rooms: RoomManager;
  /** Set once Socket.IO is attached. Absent in HTTP-only tests. */
  realtime?: { disconnectUser(userId: string, message: string): number; connectedSockets(): number };
  /** Serves the single-page app for non-API routes in production. */
  serveSpa?: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  /** Drafts questions with Claude. Present only when ANTHROPIC_API_KEY is set; tests pass a stand-in. */
  drafter?: QuestionDrafter;
}

export type RouteModule = (app: FastifyInstance, deps: AppDeps) => Promise<void>;

export async function buildApp(base: Omit<AppDeps, 'serveSpa' | 'rooms' | 'log'>, extraRoutes: RouteModule[] = []): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  const { config } = base;
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: config.trustProxy,
    bodyLimit: 1_000_000,
  });
  const deps = { ...base, log: app.log } as AppDeps;
  deps.rooms = new RoomManager(deps);
  app.addHook('onClose', async () => deps.rooms.shutdown());
  const stopRetention = scheduleRetention(deps.db, app.log);
  app.addHook('onClose', async () => stopRetention());
  // First, so every hook, plugin and route reports errors in the same shape.
  registerErrorHandler(app, deps);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...config.allowedOrigins, ...config.allowedOrigins.map((o) => o.replace(/^http/, 'ws'))],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', keyGenerator: requestKey, allowList: notApi });
  await app.register(multipart, { limits: { fileSize: 2_000_000, files: 1, fields: 5 } });

  registerAuthHook(app, deps);
  registerCsrfGuard(app, deps);

  app.get('/api/health', async () => {
    await deps.pool.query('select 1');
    return { ok: true, environment: config.APP_ENV };
  });

  await authRoutes(app, deps);
  for (const register of extraRoutes) await register(app, deps);

  const webDist = resolve(process.cwd(), config.WEB_DIST);
  if (existsSync(resolve(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false, index: false });
    deps.serveSpa = async (_req, reply) => reply.type('text/html').header('cache-control', 'no-cache').sendFile('index.html');
    app.get('/', (req, reply) => deps.serveSpa!(req, reply));
  }
  // The demo runs entirely in the browser (bots, no server calls), so it is just files: handy
  // for showing the games on one screen when players' devices cannot join.
  const demoDist = resolve(process.cwd(), config.WEB_DEMO_DIST);
  if (existsSync(resolve(demoDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: demoDist, prefix: '/demo/', decorateReply: false, index: ['index.html'] });
    app.get('/demo', (_req, reply) => reply.redirect('/demo/'));
  }
  return { app, deps };
}
