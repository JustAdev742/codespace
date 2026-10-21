import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { displayNameSchema, levelFromXp, passwordSchema, usernameSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { noStore, requireAccount, requireAuth, type AuthContext } from '../../http/context.ts';
import { sessionCookieOptions } from '../../http/plugins.ts';
import { parse } from '../../lib/validate.ts';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  changePassword,
  claimGuest,
  createGuest,
  createSession,
  login,
  newRecoveryCode,
  recoverWithCode,
  registerUser,
  revokeSession,
} from './service.ts';
import { afterAccountCreated } from '../economy/welcome.ts';
import { flagsFor } from '../flags/service.ts';

const thisYear = new Date().getUTCFullYear();
const birthYear = z.number().int().min(thisYear - 120).max(thisYear - 4).optional();
const accountType = z.enum(['player', 'student', 'teacher']).default('player');

const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  accountType,
  birthYear,
});
const loginSchema = z.object({ username: z.string().trim().toLowerCase().min(1).max(40), password: z.string().min(1).max(200) });
const guestSchema = z.object({ displayName: displayNameSchema.optional() });
const claimSchema = z.object({ username: usernameSchema, password: passwordSchema, accountType, birthYear });
const recoverSchema = z.object({ username: z.string().trim().toLowerCase().min(1).max(40), recoveryCode: z.string().trim().min(8).max(40), newPassword: passwordSchema });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

/** The bootstrap payload the web app loads on every page: who you are and what you may do. */
export function meResponse(auth: AuthContext, deps: AppDeps) {
  const u = auth.user;
  return {
    user: {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      isGuest: u.isGuest,
      accountType: u.accountType,
      ageBand: u.ageBand,
      isTestAccount: u.isTestAccount,
      friendCode: u.friendCode,
      level: levelFromXp(u.xp),
      preferences: u.preferences,
      muted: Boolean(u.mutedUntil && u.mutedUntil > new Date()),
    },
    roles: auth.roles,
    permissions: [...auth.permissions].sort(),
    environment: deps.config.APP_ENV,
  };
}

const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

async function startSession(deps: AppDeps, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const s = await createSession(deps.db, deps.config, userId, meta(req));
  reply.setCookie(SESSION_COOKIE, s.token, sessionCookieOptions(deps, SESSION_DAYS * 86_400));
  return s;
}

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  const limited = (max: number, minutes: number) => ({ config: { rateLimit: { max, timeWindow: `${minutes} minutes` } } });

  app.get('/api/auth/me', async (req, reply) => {
    noStore(reply);
    // Feature flags as they apply to this viewer, so the app can switch features on and off. Evaluated on the server.
    const flags = await flagsFor(deps.db, req.auth);
    if (!req.auth) return { user: null, roles: [], permissions: [], environment: deps.config.APP_ENV, flags };
    return { ...meResponse(req.auth, deps), flags };
  });

  // A classroom often shares one public IP, so these limits are per IP but generous;
  // brute force against a single account is stopped by the per-account lockout instead.
  app.post('/api/auth/register', limited(40, 10), async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const { user, recoveryCode } = await registerUser(deps.db, body);
    await afterAccountCreated(deps, user.id);
    await startSession(deps, req, reply, user.id);
    return { ok: true, recoveryCode };
  });

  app.post('/api/auth/login', limited(60, 1), async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = await login(deps.db, body.username, body.password);
    await startSession(deps, req, reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/guest', limited(60, 10), async (req, reply) => {
    if (req.auth) return { ok: true };
    const body = parse(guestSchema, req.body ?? {});
    const user = await createGuest(deps.db, body.displayName);
    await afterAccountCreated(deps, user.id);
    await startSession(deps, req, reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/claim', limited(20, 10), async (req) => {
    const auth = requireAuth(req);
    const body = parse(claimSchema, req.body);
    const { recoveryCode } = await claimGuest(deps.db, auth.user.id, body);
    return { ok: true, recoveryCode };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) await revokeSession(deps.db, req.auth.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/recover', limited(10, 15), async (req, reply) => {
    const body = parse(recoverSchema, req.body);
    const { user, recoveryCode } = await recoverWithCode(deps.db, body.username, body.recoveryCode, body.newPassword);
    await startSession(deps, req, reply, user.id);
    return { ok: true, recoveryCode };
  });

  app.post('/api/auth/password', limited(10, 10), async (req) => {
    const auth = requireAccount(req);
    const body = parse(passwordChangeSchema, req.body);
    await changePassword(deps.db, auth.user.id, auth.sessionId, body.currentPassword, body.newPassword);
    return { ok: true };
  });

  app.post('/api/auth/recovery-code', limited(5, 10), async (req) => {
    const auth = requireAccount(req);
    return { ok: true, recoveryCode: await newRecoveryCode(deps.db, auth.user.id) };
  });
}
