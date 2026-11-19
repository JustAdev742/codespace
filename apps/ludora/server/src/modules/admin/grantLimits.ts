import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/context.ts';
import { AppError } from '../../lib/errors.ts';
import { utcDay } from '../../lib/time.ts';
import { dailyLimitFor, getGrantLimits } from '../economy/config.ts';

/*
 * An economy manager's daily total of grants (D58). Every staff grant writes an audit row in the
 * same transaction as the grant itself, so the day's total is read from the audit log (indexed by
 * actor and time), and a grant and its count can never disagree. Administrators hold
 * economy.limits and are not held to the daily total; the per-change cap still applies to them.
 */

/** The audit actions that count towards the daily total. */
export const COUNTED_GRANT_ACTIONS = ['economy.grant', 'economy.class_grant'] as const;

/** What an account has granted since 00:00 UTC today, per currency. */
export async function grantedToday(db: DbOrTx, actorId: string, now = new Date()): Promise<Record<string, number>> {
  const since = new Date(`${utcDay(now)}T00:00:00Z`);
  const rows = await db.execute<{ currency: string | null; total: string }>(sql`
    select after->>'currency' as currency, coalesce(sum(coalesce((after->>'total')::bigint, (after->>'amount')::bigint)), 0) as total
    from audit_log
    where actor_id = ${actorId} and created_at >= ${since} and action in ('economy.grant', 'economy.class_grant') and after ? 'currency'
    group by 1`);
  const out: Record<string, number> = {};
  for (const r of rows.rows) if (r.currency) out[r.currency] = Number(r.total);
  return out;
}

/** Whether the daily total applies to this person: everyone who grants without economy.limits. */
export function heldToDailyLimit(auth: AuthContext): boolean {
  return !auth.permissions.has('economy.limits');
}

/**
 * Refuse a grant that would take the actor past their daily total. Call inside the grant's
 * transaction: the advisory lock makes two grants sent at once queue, so both cannot slip under.
 */
export async function assertWithinDailyLimit(tx: DbOrTx, auth: AuthContext, currency: string, amount: number): Promise<void> {
  if (!heldToDailyLimit(auth)) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grant-limit:${auth.user.id}`}))`);
  const limits = await getGrantLimits(tx);
  const limit = dailyLimitFor(limits, currency);
  const used = (await grantedToday(tx, auth.user.id))[currency] ?? 0;
  if (used + amount > limit) {
    const left = Math.max(0, limit - used);
    throw new AppError(
      409,
      'conflict',
      left === 0
        ? `You have reached today's grant limit for this currency (${limit.toLocaleString('en-GB')}). It resets at 00:00 UTC. An administrator can make the grant or change your limit.`
        : `That is over today's grant limit. You can grant ${left.toLocaleString('en-GB')} more today (limit ${limit.toLocaleString('en-GB')}). An administrator can make bigger grants.`,
      { amount: `At most ${left.toLocaleString('en-GB')} more today.` },
    );
  }
}
