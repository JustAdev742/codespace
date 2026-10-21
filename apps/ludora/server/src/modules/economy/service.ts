import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Config } from '../../config.ts';
import type { Db, DbOrTx, Tx } from '../../db/client.ts';
import { currencies, economyOps, entitlements, ledger, users, wallets } from '../../db/schema.ts';
import { AppError, conflict, insufficientFunds } from '../../lib/errors.ts';

/*
 * The only code that changes balances. Every change:
 *  - locks the wallet row (SELECT ... FOR UPDATE) for the rest of the transaction,
 *  - writes a ledger entry with the balance after the change,
 *  - relies on CHECK (balance >= 0) as a last line of defence.
 * Operations that a client can retry (purchases, pack openings, claims)
 * run inside withOperation, keyed by an idempotency key, so a retry or a
 * double click returns the first result instead of charging twice.
 */

export type LedgerReason =
  | 'welcome'
  | 'game_reward'
  | 'purchase'
  | 'pack_open'
  | 'quest_reward'
  | 'achievement_reward'
  | 'level_reward'
  | 'streak_reward'
  | 'collection_reward'
  | 'recycle'
  | 'craft'
  | 'admin_grant'
  | 'admin_revoke'
  | 'test_reset'
  | 'event_expire';

export interface Movement {
  userId: string;
  currency: string;
  amount: number;
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  opId?: number;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

async function lockWallet(tx: DbOrTx, userId: string, currency: string): Promise<number> {
  await tx.insert(wallets).values({ userId, currency, balance: 0 }).onConflictDoNothing();
  const rows = await tx
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
    .for('update');
  return rows[0]?.balance ?? 0;
}

async function assertCurrency(tx: DbOrTx, currency: string) {
  const rows = await tx.select({ active: currencies.active, expiresAt: currencies.expiresAt }).from(currencies).where(eq(currencies.code, currency)).limit(1);
  const c = rows[0];
  if (!c) throw new AppError(400, 'bad_request', `Unknown currency ${currency}.`);
  return c;
}

export async function credit(tx: DbOrTx, m: Movement): Promise<number> {
  if (!Number.isInteger(m.amount) || m.amount < 0) throw new Error(`credit amount must be a non-negative integer, got ${m.amount}`);
  await assertCurrency(tx, m.currency);
  const before = await lockWallet(tx, m.userId, m.currency);
  if (m.amount === 0) return before;
  const after = before + m.amount;
  await tx.update(wallets).set({ balance: after, updatedAt: new Date() }).where(and(eq(wallets.userId, m.userId), eq(wallets.currency, m.currency)));
  await tx.insert(ledger).values({
    userId: m.userId,
    currency: m.currency,
    delta: m.amount,
    balanceAfter: after,
    reason: m.reason,
    refType: m.refType ?? null,
    refId: m.refId ?? null,
    opId: m.opId ?? null,
    actorId: m.actorId ?? null,
    metadata: m.metadata ?? null,
  });
  return after;
}

export interface DebitResult {
  balance: number;
  /** True when a test entitlement covered the cost and nothing was taken. */
  unlimited: boolean;
}

export async function debit(tx: DbOrTx, m: Movement & { allowUnlimited?: boolean; config?: Config }): Promise<DebitResult> {
  if (!Number.isInteger(m.amount) || m.amount < 0) throw new Error(`debit amount must be a non-negative integer, got ${m.amount}`);
  const c = await assertCurrency(tx, m.currency);
  if (!c.active || (c.expiresAt && c.expiresAt < new Date())) throw new AppError(409, 'not_available', 'That currency can no longer be spent.');
  const before = await lockWallet(tx, m.userId, m.currency);
  if (m.amount === 0) return { balance: before, unlimited: false };
  if (m.allowUnlimited !== false && (await hasUnlimitedCurrency(tx, m.userId))) {
    await tx.insert(ledger).values({
      userId: m.userId,
      currency: m.currency,
      delta: 0,
      balanceAfter: before,
      reason: m.reason,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      opId: m.opId ?? null,
      actorId: m.actorId ?? null,
      unlimited: true,
      metadata: { ...(m.metadata ?? {}), wouldHaveCost: m.amount },
    });
    return { balance: before, unlimited: true };
  }
  if (before < m.amount) throw insufficientFunds(`You need ${m.amount - before} more to do that.`);
  const after = before - m.amount;
  await tx.update(wallets).set({ balance: after, updatedAt: new Date() }).where(and(eq(wallets.userId, m.userId), eq(wallets.currency, m.currency)));
  await tx.insert(ledger).values({
    userId: m.userId,
    currency: m.currency,
    delta: -m.amount,
    balanceAfter: after,
    reason: m.reason,
    refType: m.refType ?? null,
    refId: m.refId ?? null,
    opId: m.opId ?? null,
    actorId: m.actorId ?? null,
    metadata: m.metadata ?? null,
  });
  return { balance: after, unlimited: false };
}

/**
 * Unlimited test currency needs both: the account is flagged as a test
 * account, and it holds an active unlimited_currency entitlement. Neither
 * can be set by the account's owner; both are audited staff actions.
 */
export async function hasUnlimitedCurrency(tx: DbOrTx, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: entitlements.id })
    .from(entitlements)
    .innerJoin(users, eq(users.id, entitlements.userId))
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.kind, 'unlimited_currency'),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())),
        eq(users.isTestAccount, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface OperationResult<T> {
  result: T;
  replayed: boolean;
}

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,80}$/;

/**
 * Run an economy operation exactly once per (user, key). A concurrent
 * duplicate waits on the unique index until the first commits, then
 * returns its stored result. If the first attempt failed, nothing was
 * stored and the retry runs normally.
 */
export async function withOperation<T>(db: Db, userId: string, idemKey: string, kind: string, fn: (tx: Tx, opId: number) => Promise<T>): Promise<OperationResult<T>> {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idemKey)) throw new AppError(400, 'bad_request', 'Missing or invalid request key.');
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(economyOps).values({ userId, idemKey, kind }).onConflictDoNothing().returning({ id: economyOps.id });
    if (!inserted[0]) {
      const existing = await tx.select().from(economyOps).where(and(eq(economyOps.userId, userId), eq(economyOps.idemKey, idemKey))).limit(1);
      const row = existing[0];
      if (!row) throw conflict('Please try again.');
      if (row.kind !== kind) throw conflict('That request key was already used for something else.');
      return { result: row.result as T, replayed: true };
    }
    const opId = inserted[0].id;
    const result = await fn(tx, opId);
    await tx.update(economyOps).set({ result: result as object }).where(eq(economyOps.id, opId));
    return { result, replayed: false };
  });
}

export async function balancesOf(db: DbOrTx, userId: string): Promise<Record<string, number>> {
  const rows = await db.select({ currency: wallets.currency, balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.currency, r.balance]));
}

export async function ensureWallets(tx: DbOrTx, userId: string): Promise<void> {
  await tx.execute(sql`insert into wallets (user_id, currency, balance)
    select ${userId}::uuid, code, 0 from currencies where active and kind <> 'event'
    on conflict do nothing`);
}
