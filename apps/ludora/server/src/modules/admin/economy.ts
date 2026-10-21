import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  CORE_CURRENCIES,
  CURRENCY_KINDS,
  ITEM_GRANT_MAX,
  ITEM_TYPE_INFO,
  TEST_GRANT_MAX,
  currencyCodeSchema,
  realGrantCap,
  staffReasonSchema,
  type ItemType,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { currencies, equipped, items, ledger, packOpenings, packs, purchases, shopListings, users, wallets } from '../../db/schema.ts';
import { noStore, type AuthContext } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { DEFAULT_RULES, economyRulesSchema, getRules, saveRules } from '../economy/config.ts';
import { credit, debit, IDEMPOTENCY_KEY_PATTERN, withOperation } from '../economy/service.ts';
import { grantItem, ownedQuantity, takeItem } from '../inventory/service.ts';
import { computeOdds, parseDropTable, resolvePool } from '../packs/service.ts';
import { audit, confirmWordFor, loadUser, requireConfirm, staff, staffLimit } from './common.ts';

const isoDate = z.iso.datetime({ offset: true });

const movementSchema = z
  .object({
    userId: z.string().uuid(),
    currency: currencyCodeSchema.optional(),
    amount: z.number().int().min(1).max(TEST_GRANT_MAX).optional(),
    itemId: z.string().min(1).max(64).optional(),
    quantity: z.number().int().min(1).max(ITEM_GRANT_MAX).default(1),
    reason: staffReasonSchema,
    requestKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN, 'Missing request key'),
    confirm: z.string().max(80).optional(),
  })
  .refine((g) => Boolean(g.currency && g.amount) !== Boolean(g.itemId), 'Choose either an amount of a currency or an item.');
export type MovementInput = z.infer<typeof movementSchema>;
export { movementSchema };

const currencyFields = {
  name: z.string().trim().min(2).max(32),
  description: z.string().trim().min(1).max(200),
  hue: z.number().int().min(0).max(359),
  howToEarn: z.string().trim().min(1).max(200),
  howToSpend: z.string().trim().min(1).max(200),
  expiresAt: isoDate.nullable(),
  sort: z.number().int().min(-1000).max(1000),
};
const currencyCreateSchema = z.object({ code: currencyCodeSchema, kind: z.enum(CURRENCY_KINDS), ...currencyFields, expiresAt: currencyFields.expiresAt.default(null), sort: currencyFields.sort.default(0), reason: staffReasonSchema });
const currencyPatchSchema = z
  .object(currencyFields)
  .partial()
  .extend({ active: z.boolean().optional(), reason: staffReasonSchema, confirm: z.string().max(80).optional() });

type Mode = 'staff' | 'test';

/**
 * Give or take currency or items. 'staff' is the economy.grant tool and
 * works on any account within the caps; 'test' is the testing tool and only
 * ever touches test accounts. Both are idempotent per request key, write
 * the ledger, and are audited in the same transaction.
 */
export async function applyMovement(deps: AppDeps, req: FastifyRequest, auth: AuthContext, body: MovementInput, direction: 'grant' | 'revoke', mode: Mode) {
  const target = await loadUser(deps.db, body.userId);
  const u = target.user;
  if (u.id === auth.user.id) throw forbidden('You cannot change your own balance or items with staff tools. Use a test account.');
  if (mode === 'test' && !u.isTestAccount) throw forbidden('Testing tools only work on test accounts.');
  const real = !u.isTestAccount;
  if (real) {
    if (body.currency && body.amount && body.amount > realGrantCap(body.currency)) {
      throw new AppError(400, 'validation_failed', `At most ${realGrantCap(body.currency).toLocaleString('en-GB')} at a time for a player's account.`, { amount: 'Over the limit for one change.' });
    }
    // Changing a real player's balance always needs the account name typed out.
    requireConfirm(body.confirm, confirmWordFor(u), 'the account name');
  }
  let item: typeof items.$inferSelect | undefined;
  if (body.itemId) {
    [item] = await deps.db.select().from(items).where(eq(items.id, body.itemId)).limit(1);
    if (!item) throw notFound('That item does not exist.');
    if (direction === 'grant' && real && item.isTestOnly) throw forbidden('Test-only items can only go to test accounts.');
    if (direction === 'grant' && real && item.releaseState === 'draft') throw conflict('Draft items cannot be given to players.');
  }
  const action = `${mode === 'test' ? 'testing' : 'economy'}.${direction}`;
  const reason = direction === 'grant' ? 'admin_grant' : 'admin_revoke';

  const { result, replayed } = await withOperation(deps.db, u.id, `staff:${body.requestKey}`, action, async (tx, opId) => {
    let after: Record<string, unknown>;
    if (body.currency && body.amount) {
      const meta = { reason: body.reason, tool: mode };
      const balance =
        direction === 'grant'
          ? await credit(tx, { userId: u.id, currency: body.currency, amount: body.amount, reason, opId, actorId: auth.user.id, metadata: meta })
          : (await debit(tx, { userId: u.id, currency: body.currency, amount: body.amount, reason, opId, actorId: auth.user.id, metadata: meta, allowUnlimited: false })).balance;
      after = { currency: body.currency, amount: body.amount, balance };
    } else {
      const it = item!;
      const stackable = ITEM_TYPE_INFO[it.type as ItemType]?.stackable ?? false;
      let quantity: number;
      if (direction === 'grant') {
        const owned = await ownedQuantity(tx, u.id, it.id, true);
        if (!stackable && owned > 0) throw conflict('They already own that item.');
        quantity = await grantItem(tx, { userId: u.id, itemId: it.id, quantity: stackable ? body.quantity : 1, source: mode === 'test' ? 'test_grant' : 'admin_grant' });
      } else {
        quantity = await takeItem(tx, u.id, it.id, stackable ? body.quantity : 1);
        if (quantity === 0) await tx.delete(equipped).where(and(eq(equipped.userId, u.id), eq(equipped.itemId, it.id)));
      }
      after = { itemId: it.id, itemName: it.name, quantity };
    }
    await audit(deps, req, tx, { actor: auth, action, targetType: 'user', targetId: u.id, targetName: u.username ?? u.displayName, reason: body.reason, after });
    return after;
  });
  return { ok: true, replayed, ...result };
}

export async function adminEconomyRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/admin/economy/overview', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [circulation, flows, openings, packRows, topPurchases] = await Promise.all([
      db.execute<{ code: string; name: string; kind: string; circulating: string; holders: string }>(sql`
        select c.code, c.name, c.kind,
          coalesce(sum(w.balance) filter (where not u.is_test_account), 0) as circulating,
          count(*) filter (where w.balance > 0 and not u.is_test_account) as holders
        from ${currencies} c
        left join ${wallets} w on w.currency = c.code
        left join ${users} u on u.id = w.user_id
        group by c.code, c.name, c.kind, c.sort order by c.sort`),
      db.execute<{ currency: string; reason: string; total: string; n: string }>(sql`
        select l.currency, l.reason, sum(l.delta) as total, count(*) as n
        from ${ledger} l join ${users} u on u.id = l.user_id
        where l.created_at > ${since} and not u.is_test_account and not l.unlimited
        group by l.currency, l.reason order by l.currency, l.reason`),
      db.execute<{ pack_id: string; rarity: string; n: string }>(sql`
        select o.pack_id, o.rarity, count(*) as n
        from ${packOpenings} o join ${users} u on u.id = o.user_id
        where o.created_at > ${since} and not u.is_test_account and not o.unlimited and not o.pity
        group by o.pack_id, o.rarity`),
      db.select().from(packs).orderBy(asc(packs.sort)),
      db.execute<{ listing_id: string; n: string; spent: string; currency: string }>(sql`
        select p.listing_id, count(*) as n, sum(p.price_amount) as spent, min(p.price_currency) as currency
        from ${purchases} p join ${users} u on u.id = p.user_id
        where p.created_at > ${since} and not u.is_test_account and not p.unlimited
        group by p.listing_id order by count(*) desc limit 10`),
    ]);
    // Observed rarities next to the disclosed odds, so staff can check the draws match what players are told.
    const lanterns = [];
    for (const p of packRows) {
      const table = parseDropTable(p.dropTable);
      const odds = computeOdds(table, await resolvePool(db, table));
      const seen = openings.rows.filter((o) => o.pack_id === p.id);
      const total = seen.reduce((n, o) => n + Number(o.n), 0);
      lanterns.push({
        id: p.id,
        name: p.name,
        releaseState: p.releaseState,
        opened: total,
        rarities: odds.map((o) => {
          const n = Number(seen.find((s) => s.rarity === o.rarity)?.n ?? 0);
          return { rarity: o.rarity, disclosedPercent: o.percent, observedPercent: total ? (n / total) * 100 : null, count: n };
        }),
      });
    }
    return {
      since: since.toISOString(),
      currencies: circulation.rows.map((r) => ({ code: r.code, name: r.name, kind: r.kind, circulating: Number(r.circulating), holders: Number(r.holders) })),
      flows: flows.rows.map((r) => ({ currency: r.currency, reason: r.reason, total: Number(r.total), count: Number(r.n) })),
      lanterns,
      topPurchases: topPurchases.rows.map((r) => ({ listingId: r.listing_id, count: Number(r.n), spent: Number(r.spent), currency: r.currency })),
    };
  });

  app.get('/api/admin/economy/ledger', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const q = parse(
      z.object({
        userId: z.string().uuid().optional(),
        currency: currencyCodeSchema.optional(),
        reason: z.string().max(40).optional(),
        staffOnly: z.enum(['1']).optional(),
        before: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );
    const actor = alias(users, 'actor');
    const conds: (SQL | undefined)[] = [];
    if (q.userId) conds.push(eq(ledger.userId, q.userId));
    if (q.currency) conds.push(eq(ledger.currency, q.currency));
    if (q.reason) conds.push(eq(ledger.reason, q.reason));
    if (q.staffOnly) conds.push(inArray(ledger.reason, ['admin_grant', 'admin_revoke', 'test_reset']));
    if (q.before) conds.push(lt(ledger.id, q.before));
    const rows = await db
      .select({ l: ledger, name: users.displayName, username: users.username, isTest: users.isTestAccount, actorName: actor.displayName })
      .from(ledger)
      .innerJoin(users, eq(users.id, ledger.userId))
      .leftJoin(actor, eq(actor.id, ledger.actorId))
      .where(and(...conds))
      .orderBy(desc(ledger.id))
      .limit(100);
    return {
      entries: rows.map(({ l, name, username, isTest, actorName }) => ({
        id: l.id,
        userId: l.userId,
        user: username ?? name,
        isTestAccount: isTest,
        currency: l.currency,
        delta: l.delta,
        balanceAfter: l.balanceAfter,
        reason: l.reason,
        unlimited: l.unlimited,
        actor: actorName,
        note: (l.metadata as { reason?: string } | null)?.reason ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      nextBefore: rows.length === 100 ? rows[rows.length - 1]!.l.id : null,
    };
  });

  app.post('/api/admin/economy/grant', staffLimit(20), async (req) => {
    const auth = staff(req, 'economy.grant');
    return applyMovement(deps, req, auth, parse(movementSchema, req.body), 'grant', 'staff');
  });

  app.post('/api/admin/economy/revoke', staffLimit(20), async (req) => {
    const auth = staff(req, 'economy.grant');
    return applyMovement(deps, req, auth, parse(movementSchema, req.body), 'revoke', 'staff');
  });

  app.get('/api/admin/economy/rules', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    return { rules: await getRules(db), defaults: DEFAULT_RULES };
  });

  app.put('/api/admin/economy/rules', staffLimit(10), async (req) => {
    const auth = staff(req, 'economy.configure');
    const body = parse(z.object({ rules: economyRulesSchema, reason: staffReasonSchema }), req.body);
    if (body.rules.starterItems.length) {
      const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, body.rules.starterItems));
      const missing = body.rules.starterItems.filter((id) => !found.some((f) => f.id === id));
      if (missing.length) throw new AppError(400, 'validation_failed', `Unknown starter item: ${missing.join(', ')}.`, { 'rules.starterItems': 'Unknown item id.' });
    }
    const before = await getRules(db);
    await db.transaction(async (tx) => {
      await saveRules(tx, body.rules, auth.user.id);
      await audit(deps, req, tx, { actor: auth, action: 'economy.rules', targetType: 'economy', targetId: 'rules', reason: body.reason, before, after: body.rules });
    });
    return { ok: true, rules: await getRules(db) };
  });

  app.get('/api/admin/currencies', async (req, reply) => {
    noStore(reply);
    staff(req, 'economy.view');
    const rows = await db.select().from(currencies).orderBy(asc(currencies.sort));
    const priced = await db.select({ currency: shopListings.priceCurrency, n: sql<number>`count(*)::int` }).from(shopListings).where(eq(shopListings.active, true)).groupBy(shopListings.priceCurrency);
    return {
      currencies: rows.map((c) => ({ ...c, expiresAt: c.expiresAt?.toISOString() ?? null, listings: priced.find((p) => p.currency === c.code)?.n ?? 0, core: (CORE_CURRENCIES as readonly string[]).includes(c.code) })),
    };
  });

  app.post('/api/admin/currencies', staffLimit(10), async (req) => {
    const auth = staff(req, 'economy.configure');
    const body = parse(currencyCreateSchema, req.body);
    const { reason, ...values } = body;
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(currencies)
        .values({ ...values, expiresAt: values.expiresAt ? new Date(values.expiresAt) : null })
        .onConflictDoNothing()
        .returning();
      if (!created) throw conflict('A currency with that code already exists.', { code: 'Already taken.' });
      await audit(deps, req, tx, { actor: auth, action: 'currency.create', targetType: 'currency', targetId: created.code, targetName: created.name, reason, after: created });
      return { ok: true, currency: created };
    });
  });

  app.patch('/api/admin/currencies/:code', staffLimit(20), async (req) => {
    const auth = staff(req, 'economy.configure');
    const { code } = parse(z.object({ code: currencyCodeSchema }), req.params);
    const body = parse(currencyPatchSchema, req.body);
    const { reason, confirm, ...patch } = body;
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(currencies).where(eq(currencies.code, code)).for('update');
      if (!before) throw notFound('No currency with that code.');
      if (patch.active === false && before.active) {
        if ((CORE_CURRENCIES as readonly string[]).includes(code)) throw conflict('Sparks, Moonstones and Dust cannot be switched off.');
        requireConfirm(confirm, code, 'the currency code');
      }
      const { expiresAt, ...rest } = patch;
      const values = { ...rest, ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}) };
      const [after] = await tx.update(currencies).set(values).where(eq(currencies.code, code)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'currency.update', targetType: 'currency', targetId: code, targetName: before.name, reason, before, after });
      return { ok: true, currency: after };
    });
  });

  /** Wallet totals for one account, for the grant form's "they have" line. */
  app.get('/api/admin/users/:id/wallet', async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'economy.view');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const target = await loadUser(db, id);
    const rows = await db.select().from(wallets).where(eq(wallets.userId, id));
    return { userId: id, isTestAccount: target.user.isTestAccount, confirmWord: confirmWordFor(target.user), balances: Object.fromEntries(rows.map((r) => [r.currency, r.balance])), self: id === auth.user.id };
  });
}
