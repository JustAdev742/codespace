import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { outranks, type Permission, type Role } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { users } from '../../db/schema.ts';
import { requirePermission, type AuthContext } from '../../http/context.ts';
import { AppError, forbidden, notFound } from '../../lib/errors.ts';
import { hashIp } from '../../lib/crypto.ts';
import { rolesOf } from '../auth/service.ts';
import { writeAudit, type AuditEntry } from '../audit/service.ts';

/*
 * Shared guards for staff endpoints. Every staff route checks a permission
 * on the server, every change needs a reason, and changes to a person's
 * account also need the actor to outrank that person.
 */

export type UserRow = typeof users.$inferSelect;

/** The staff permission check: also requires a registered account, so a guest session can never hold staff rights. */
export function staff(req: FastifyRequest, permission: Permission): AuthContext {
  const auth = requirePermission(req, permission);
  if (auth.user.isGuest) throw forbidden();
  return auth;
}

/**
 * Per-account rate limit for staff writes. Keyed by user rather than IP,
 * so one busy office does not share a budget, and a stolen staff session
 * cannot run through thousands of changes a minute.
 */
export function staffLimit(max: number, timeWindow = '1 minute') {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow,
        keyGenerator: (req: FastifyRequest) => (req.auth ? `staff:${req.auth.user.id}` : `ip:${req.ip}`),
      },
    },
  };
}

/**
 * Typed confirmation for destructive actions. The client asks the person to
 * type the target's name; the server checks it, so a forged or accidental
 * request without it does nothing.
 */
export function requireConfirm(given: string | undefined, expected: string, what: string): void {
  if ((given ?? '').trim().toLowerCase() !== expected.trim().toLowerCase()) {
    throw new AppError(400, 'confirmation_required', `Type ${what} to confirm.`, { confirm: `Type "${expected}" to confirm.` });
  }
}

/** The word a person types to confirm an action on an account: the username, or the display name for guests. */
export function confirmWordFor(u: Pick<UserRow, 'username' | 'displayName'>): string {
  return u.username ?? u.displayName;
}

export async function loadUser(db: DbOrTx, id: string, lock = false): Promise<{ user: UserRow; roles: Role[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('No account with that id.');
  const q = db.select().from(users).where(eq(users.id, id)).limit(1);
  const [user] = lock ? await q.for('update') : await q;
  if (!user) throw notFound('No account with that id.');
  return { user, roles: await rolesOf(db, id) };
}

/** Staff may act on another account only when they outrank it, and never on their own account through staff tools. */
export function assertCanActOn(auth: AuthContext, target: { user: UserRow; roles: Role[] }, what = 'change this account'): void {
  if (target.user.id === auth.user.id) throw forbidden(`You cannot ${what} on your own account. Ask another staff member.`);
  if (!outranks(auth.roles, target.roles)) throw forbidden(`You cannot ${what}: this account has the same or a higher staff role than yours.`);
}

export function ipHashOf(deps: AppDeps, req: FastifyRequest): string | null {
  return hashIp(req.ip, deps.config.IP_HASH_KEY);
}

export async function audit(deps: AppDeps, req: FastifyRequest, tx: DbOrTx, entry: Omit<AuditEntry, 'ipHash'>): Promise<void> {
  await writeAudit(tx, deps.config.APP_ENV, { ...entry, ipHash: ipHashOf(deps, req) });
}

/** Escape LIKE wildcards in user-typed search text. */
export function likeEscape(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A short view of an account for staff lists. Never includes password hashes, recovery hashes or full emails. */
export function staffUserSummary(u: UserRow, roles: Role[]) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isGuest: u.isGuest,
    accountType: u.accountType,
    ageBand: u.ageBand,
    isTestAccount: u.isTestAccount,
    status: u.status,
    level: u.level,
    roles,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
  };
}

/** "scott@example.com" -> "s***@e***.com". Full addresses are only shown to staff who can edit accounts. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}
