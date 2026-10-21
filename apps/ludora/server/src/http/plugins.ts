import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.ts';
import type { AppDeps } from '../app.ts';
import { SESSION_COOKIE, resolveSession } from '../modules/auth/service.ts';
import { errorReports } from '../db/schema.ts';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CSRF_HEADER = 'x-ludora-csrf';

/**
 * Cross-site request forgery protection for cookie-authenticated calls.
 * A custom header cannot be sent cross-origin without a CORS preflight,
 * and this server answers no preflights, so requiring it blocks forged
 * requests. The Origin check is a second, independent line.
 */
export function registerCsrfGuard(app: FastifyInstance, deps: AppDeps) {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (!UNSAFE.has(req.method) || !req.url.startsWith('/api/')) return;
    if (req.headers[CSRF_HEADER] !== '1') throw new AppError(403, 'forbidden', 'Request blocked. Reload the page and try again.');
    const origin = req.headers.origin;
    if (origin && !deps.config.allowedOrigins.includes(origin)) throw new AppError(403, 'forbidden', 'Request blocked: unexpected origin.');
  });
}

export function registerAuthHook(app: FastifyInstance, deps: AppDeps) {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    req.auth = null;
    const token = req.cookies[SESSION_COOKIE];
    if (token) req.auth = await resolveSession(deps.db, token);
  });
}

export function sessionCookieOptions(deps: AppDeps, maxAgeSeconds: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: deps.config.cookieSecure,
    maxAge: maxAgeSeconds,
  };
}

export function registerErrorHandler(app: FastifyInstance, deps: AppDeps) {
  app.setErrorHandler(async (err: FastifyError | AppError, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' } });
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: status === 413 ? 'That upload is too large.' : 'That request was not understood.' } });
    }
    req.log.error({ err }, 'unhandled error');
    // Store a trimmed report for the admin system-health page. Never the request body.
    await deps.db
      .insert(errorReports)
      .values({
        source: 'server',
        message: String(err.message ?? err).slice(0, 500),
        stack: (err.stack ?? '').slice(0, 4000),
        context: { method: req.method, route: req.routeOptions?.url ?? null },
        userId: req.auth?.user.id ?? null,
      })
      .catch(() => {});
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' } });
  });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'No such endpoint.' } });
    return deps.serveSpa ? deps.serveSpa(req, reply) : reply.status(404).send('Not found');
  });
}
