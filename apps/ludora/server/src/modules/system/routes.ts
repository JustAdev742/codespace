import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../../app.ts';
import { errorReports } from '../../db/schema.ts';
import { parse } from '../../lib/validate.ts';

export async function systemRoutes(app: FastifyInstance, deps: AppDeps) {
  /** Browsers report unexpected errors here so staff see them in System health. Trimmed and rate-limited. */
  app.post('/api/client-errors', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ message: z.string().max(500), stack: z.string().max(3000).optional(), url: z.string().max(300).optional() }), req.body);
    await deps.db.insert(errorReports).values({ source: 'client', message: body.message, stack: body.stack ?? null, context: { url: body.url ?? null, ua: String(req.headers['user-agent'] ?? '').slice(0, 160) }, userId: req.auth?.user.id ?? null });
    return { ok: true };
  });
}
