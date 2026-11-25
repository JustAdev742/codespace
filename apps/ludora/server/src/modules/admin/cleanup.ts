import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { currencyCodeSchema, reasonProblem, staffReasonSchema } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { reports, questionSets, userRoles, users, userStats, wallets, sessions } from '../../db/schema.ts';
import { noStore, type AuthContext } from '../../http/context.ts';
import { AppError, forbidden } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { debit } from '../economy/service.ts';
import { eraseAccount } from '../users/account.ts';
import { audit, ipHashOf, staff, staffLimit } from './common.ts';
import { copiesOf, mashSigns, nameKey, nameKeys } from './spam.ts';

/*
 * The super administrator's clean-up tools: bring every balance above an amount down to it, and
 * find and remove junk accounts (keyboard-mash names, copies of another account's name). Both show
 * exactly what they will touch first, and the change only goes ahead when the person types back how
 * many accounts it is, so a list that changed in between is never acted on blind. Staff and test
 * accounts are never touched. Everything is audited with the reason.
 */

const STAFF = new Set(['tester', 'moderator', 'support', 'economist', 'admin', 'superadmin']);
const MAX_REMOVE = 200;

function superadmin(req: FastifyRequest): AuthContext {
  const auth = staff(req, 'roles.assign');
  if (!auth.roles.includes('superadmin')) throw forbidden('Only a super administrator can use the clean-up tools.');
  return auth;
}

/** A staff reason that is real words: the same first check the AI review uses. */
function checkedReason(reason: string): string {
  const problem = reasonProblem(reason);
  if (problem) throw new AppError(400, 'validation_failed', problem, { reason: problem });
  return reason.trim();
}

const capQuery = z.object({ currency: currencyCodeSchema.default('sparks'), cap: z.coerce.number().int().min(0).max(100_000_000) });
const capBody = capQuery.extend({ reason: staffReasonSchema, confirm: z.string().max(20) });
const removeBody = z.object({ userIds: z.array(z.string().uuid()).min(1).max(MAX_REMOVE), reason: staffReasonSchema, confirm: z.string().max(20) });

async function staffIds(deps: AppDeps): Promise<Set<string>> {
  const rows = await deps.db.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles);
  return new Set(rows.filter((r) => STAFF.has(r.role)).map((r) => r.userId));
}

/** The accounts a cap would change: real, non-staff accounts holding more than the cap. */
async function overCap(deps: AppDeps, currency: string, cap: number) {
  const skip = await staffIds(deps);
  const rows = await deps.db
    .select({ id: users.id, username: users.username, displayName: users.displayName, balance: wallets.balance })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(and(eq(wallets.currency, currency), gt(wallets.balance, cap), eq(users.isTestAccount, false)))
    .orderBy(desc(wallets.balance));
  return rows.filter((r) => !skip.has(r.id));
}

export async function adminCleanupRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/admin/cleanup/balances', async (req, reply) => {
    superadmin(req);
    noStore(reply);
    const q = parse(capQuery, req.query);
    const rows = await overCap(deps, q.currency, q.cap);
    return {
      currency: q.currency,
      cap: q.cap,
      count: rows.length,
      removed: rows.reduce((t, r) => t + (r.balance - q.cap), 0),
      accounts: rows.slice(0, 100),
    };
  });

  app.post('/api/admin/cleanup/balances', staffLimit(3), async (req) => {
    const auth = superadmin(req);
    const body = parse(capBody, req.body);
    const reason = checkedReason(body.reason);
    const rows = await overCap(deps, body.currency, body.cap);
    if (body.confirm.trim() !== String(rows.length)) {
      throw new AppError(409, 'conflict', `That would change ${rows.length} accounts now. Check the list again and type ${rows.length} to go ahead.`, { confirm: `Type ${rows.length}.` });
    }
    let removed = 0;
    for (const r of rows) {
      await deps.db.transaction(async (tx) => {
        const [w] = await tx.select({ balance: wallets.balance }).from(wallets).where(and(eq(wallets.userId, r.id), eq(wallets.currency, body.currency))).for('update');
        const over = (w?.balance ?? 0) - body.cap;
        if (over <= 0) return;
        await debit(tx, { userId: r.id, currency: body.currency, amount: over, reason: 'admin_revoke', actorId: auth.user.id, metadata: { reason, tool: 'cap', cap: body.cap }, allowUnlimited: false });
        removed += over;
      });
    }
    await audit(deps, req, deps.db, { actor: auth, action: 'economy.cap', targetType: 'currency', targetId: body.currency, reason, after: { cap: body.cap, accounts: rows.length, removed } });
    return { ok: true, accounts: rows.length, removed };
  });

  app.get('/api/admin/cleanup/spam', async (req, reply) => {
    const me = superadmin(req);
    noStore(reply);
    const { like } = parse(z.object({ like: z.string().trim().max(40).optional() }), req.query);
    const skip = await staffIds(deps);
    const all = await deps.db
      .select({ id: users.id, username: users.username, displayName: users.displayName, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt, status: users.status, accountType: users.accountType })
      .from(users)
      .where(and(eq(users.isGuest, false), eq(users.isTestAccount, false)));
    const people = all.filter((u) => !skip.has(u.id) && u.id !== me.user.id);
    const copies = copiesOf(all);
    const wanted = like ? nameKey(like) : '';
    const suspects = people
      .map((u) => {
        const signs = [...new Set([...mashSigns(u.username), ...mashSigns(u.displayName)])];
        const copy = copies.get(u.id);
        const matches = wanted.length >= 3 && [...nameKeys(u.username), ...nameKeys(u.displayName)].some((k) => k.includes(wanted));
        return { u, signs, copyOf: copy && copy.id !== u.id ? copy : null, matches };
      })
      .filter((s) => s.signs.length || s.copyOf || s.matches)
      .slice(0, 2000);
    const ids = suspects.map((s) => s.u.id);
    const facts = new Map<string, { games: number; sets: number; sparks: number; reports: number; network: number }>();
    if (ids.length) {
      const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      const rows = (await deps.db.execute(sql`
        select u.id,
          coalesce((select games_played from ${userStats} where user_id = u.id), 0)::int as games,
          (select count(*) from ${questionSets} where owner_id = u.id and deleted_at is null)::int as sets,
          coalesce((select balance from ${wallets} where user_id = u.id and currency = 'sparks'), 0)::int as sparks,
          (select count(*) from ${reports} where target_type = 'user' and target_id = u.id::text)::int as reports,
          (select count(distinct b.user_id) from ${sessions} a join ${sessions} b on a.ip_hash = b.ip_hash and b.user_id <> a.user_id where a.user_id = u.id and a.ip_hash is not null)::int as network
        from ${users} u where u.id in (${list})`)).rows as { id: string; games: number; sets: number; sparks: number; reports: number; network: number }[];
      for (const r of rows) facts.set(r.id, r);
    }
    return {
      like: like ?? null,
      accounts: suspects
        .map(({ u, signs, copyOf, matches }) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          accountType: u.accountType,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          signs,
          copyOf: copyOf ? { id: copyOf.id, username: copyOf.username, displayName: copyOf.displayName, createdAt: copyOf.createdAt.toISOString() } : null,
          matchesSearch: matches,
          ...(facts.get(u.id) ?? { games: 0, sets: 0, sparks: 0, reports: 0, network: 0 }),
        }))
        .sort((a, b) => Number(b.matchesSearch) - Number(a.matchesSearch) || Number(Boolean(b.copyOf)) - Number(Boolean(a.copyOf)) || b.signs.length - a.signs.length || a.games - b.games),
    };
  });

  app.post('/api/admin/cleanup/remove', staffLimit(3), async (req) => {
    const auth = superadmin(req);
    const body = parse(removeBody, req.body);
    const reason = checkedReason(body.reason);
    const ids = [...new Set(body.userIds)];
    if (body.confirm.trim() !== String(ids.length)) throw new AppError(400, 'validation_failed', `Type ${ids.length} to remove ${ids.length} accounts.`, { confirm: `Type ${ids.length}.` });
    if (ids.includes(auth.user.id)) throw forbidden('You cannot remove your own account here.');
    const skip = await staffIds(deps);
    const rows = await deps.db.select({ id: users.id, username: users.username, displayName: users.displayName, isTest: users.isTestAccount }).from(users).where(inArray(users.id, ids));
    const blocked = rows.filter((r) => skip.has(r.id) || r.isTest);
    if (blocked.length) throw forbidden(`Staff and test accounts cannot be removed here: ${blocked.map((b) => b.username ?? b.displayName).join(', ')}.`);
    const ipHash = ipHashOf(deps, req);
    let removed = 0;
    for (const r of rows) {
      await eraseAccount(deps, r.id, { actor: auth, reason, name: r.username ?? r.displayName, ipHash });
      removed++;
    }
    return { ok: true, removed, alreadyGone: ids.length - rows.length };
  });
}

