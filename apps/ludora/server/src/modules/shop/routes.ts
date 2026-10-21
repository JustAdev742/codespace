import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { EQUIP_SLOTS, RARITY_INFO, type Rarity } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { collections, equipped, inventory, items, ledger, packs, pityCounters } from '../../db/schema.ts';
import { noStore, requireAuth } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { balancesOf, credit, debit, IDEMPOTENCY_KEY_PATTERN, withOperation } from '../economy/service.ts';
import { equipItem, grantItem, ownedQuantity, takeItem, unequipSlot } from '../inventory/service.ts';
import { computeOdds, parseDropTable, payCollectionRewards, resolvePool } from '../packs/service.ts';
import { checkAchievements } from '../progression/achievements.ts';
import { purchase, shopView } from './service.ts';

const requestKey = z.string().regex(IDEMPOTENCY_KEY_PATTERN, 'Missing request key');

export async function shopRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/api/shop', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [view, balances] = await Promise.all([shopView(deps.db, auth.user.id, auth), balancesOf(deps.db, auth.user.id)]);
    return { ...view, balances };
  });

  app.post('/api/shop/purchase', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ listingId: z.string().min(1).max(80), requestKey }), req.body);
    const { result, replayed } = await purchase(deps.db, { userId: auth.user.id, listingId: body.listingId, requestKey: body.requestKey, auth });
    return { ...result, replayed, balances: await balancesOf(deps.db, auth.user.id) };
  });

  /** Odds for a Lantern, from the same table the server rolls against. */
  app.get('/api/packs/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    const [p] = await deps.db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!p || (p.releaseState !== 'live' && !auth.permissions.has('catalog.manage'))) throw notFound('That Lantern does not exist.');
    const table = parseDropTable(p.dropTable);
    const pool = await resolvePool(deps.db, table);
    const ownedRows = pool.length ? await deps.db.select({ itemId: inventory.itemId, q: inventory.quantity }).from(inventory).where(and(eq(inventory.userId, auth.user.id), inArray(inventory.itemId, pool.map((x) => x.id)))) : [];
    const owned = new Map(ownedRows.map((o) => [o.itemId, o.q]));
    const [pc] = await deps.db.select().from(pityCounters).where(and(eq(pityCounters.userId, auth.user.id), eq(pityCounters.packId, id))).limit(1);
    return {
      pack: { id: p.id, name: p.name, description: p.description, art: p.art, price: { currency: p.priceCurrency, amount: p.priceAmount } },
      odds: computeOdds(table, pool),
      pity: table.pityEvery > 0 ? { every: table.pityEvery, untilGuaranteed: Math.max(1, table.pityEvery - (pc?.sinceEpic ?? 0)) } : null,
      items: pool
        .sort((a, b) => RARITY_INFO[a.rarity].rank - RARITY_INFO[b.rarity].rank || a.name.localeCompare(b.name))
        .map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, art: i.art, owned: owned.get(i.id) ?? 0 })),
    };
  });

  /** Every collection with every live Glim; Glims you do not own come back as silhouettes (no art). */
  app.get('/api/collection', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const [cols, glims, mine, eq_] = await Promise.all([
      deps.db.select().from(collections).where(eq(collections.releaseState, 'live')).orderBy(asc(collections.sort)),
      deps.db.select().from(items).where(and(eq(items.type, 'glim'), eq(items.releaseState, 'live'), eq(items.isTestOnly, false))).orderBy(asc(items.sort)),
      deps.db.select({ itemId: inventory.itemId, q: inventory.quantity, first: inventory.firstAcquiredAt }).from(inventory).where(eq(inventory.userId, auth.user.id)),
      deps.db.select().from(equipped).where(and(eq(equipped.userId, auth.user.id), eq(equipped.slot, 'buddy'))),
    ]);
    const owned = new Map(mine.map((m) => [m.itemId, m]));
    const rewarded = new Set(
      (await deps.db.select({ refId: ledger.refId }).from(ledger).where(and(eq(ledger.userId, auth.user.id), eq(ledger.reason, 'collection_reward')))).map((r) => r.refId),
    );
    return {
      buddy: eq_[0]?.itemId ?? null,
      collections: cols.map((c) => {
        const list = glims.filter((g) => g.collectionId === c.id);
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          hue: c.hue,
          reward: c.reward,
          rewarded: rewarded.has(c.id),
          total: list.length,
          owned: list.filter((g) => (owned.get(g.id)?.q ?? 0) > 0).length,
          glims: list.map((g) => {
            const o = owned.get(g.id);
            const q = o?.q ?? 0;
            return {
              id: g.id,
              name: q > 0 ? g.name : null,
              rarity: g.rarity,
              description: q > 0 ? g.description : null,
              art: q > 0 ? g.art : null,
              silhouette: q > 0 ? null : { body: (g.art as { body: string }).body },
              owned: q,
              acquiredAt: o?.first ?? null,
              dustValue: RARITY_INFO[g.rarity as Rarity].dustValue,
              craftCost: RARITY_INFO[g.rarity as Rarity].craftCost,
            };
          }),
        };
      }),
    };
  });

  /** Owned cosmetics and what is equipped in each slot. */
  app.get('/api/locker', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const rows = await deps.db
      .select({ id: items.id, type: items.type, name: items.name, description: items.description, rarity: items.rarity, art: items.art, q: inventory.quantity })
      .from(inventory)
      .innerJoin(items, eq(items.id, inventory.itemId))
      .where(and(eq(inventory.userId, auth.user.id), sql`${inventory.quantity} > 0`))
      .orderBy(asc(items.type), asc(items.sort));
    const slots = await deps.db.select().from(equipped).where(eq(equipped.userId, auth.user.id));
    return { items: rows.map(({ q, ...r }) => ({ ...r, quantity: q })), equipped: Object.fromEntries(slots.map((s) => [s.slot, s.itemId])) };
  });

  app.post('/api/locker/equip', async (req) => {
    const auth = requireAuth(req);
    const { itemId } = parse(z.object({ itemId: z.string().min(1).max(80) }), req.body);
    const slot = await equipItem(deps.db, auth.user.id, itemId);
    return { ok: true, slot };
  });

  app.post('/api/locker/unequip', async (req) => {
    const auth = requireAuth(req);
    const { slot } = parse(z.object({ slot: z.enum(EQUIP_SLOTS) }), req.body);
    if (slot === 'buddy') throw new AppError(400, 'bad_request', 'You always need a buddy Glim. Pick a different one instead.');
    await unequipSlot(deps.db, auth.user.id, slot);
    return { ok: true };
  });

  /** Turn spare copies of a Glim into Glow Dust. One copy is always kept. */
  app.post('/api/collection/recycle', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ itemId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(999), requestKey }), req.body);
    const { result } = await withOperation(deps.db, auth.user.id, body.requestKey, 'recycle', async (tx, opId) => {
      const [item] = await tx.select().from(items).where(eq(items.id, body.itemId)).limit(1);
      if (!item || item.type !== 'glim') throw new AppError(400, 'bad_request', 'Only Glims can be recycled.');
      const have = await ownedQuantity(tx, auth.user.id, item.id, true);
      if (have - body.quantity < 1) throw new AppError(409, 'conflict', 'You can only recycle spare copies. One always stays in your collection.');
      await takeItem(tx, auth.user.id, item.id, body.quantity);
      const dust = RARITY_INFO[item.rarity as Rarity].dustValue * body.quantity;
      await credit(tx, { userId: auth.user.id, currency: 'dust', amount: dust, reason: 'recycle', refType: 'item', refId: item.id, opId, metadata: { quantity: body.quantity } });
      return { itemId: item.id, recycled: body.quantity, dust, left: have - body.quantity };
    });
    return { ...result, balances: await balancesOf(deps.db, auth.user.id) };
  });

  /** Spend Glow Dust on a specific live Glim. */
  app.post('/api/collection/craft', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ itemId: z.string().min(1).max(80), requestKey }), req.body);
    const { result } = await withOperation(deps.db, auth.user.id, body.requestKey, 'craft', async (tx, opId) => {
      const [item] = await tx.select().from(items).where(eq(items.id, body.itemId)).limit(1);
      if (!item || item.type !== 'glim' || item.releaseState !== 'live' || item.isTestOnly) throw new AppError(400, 'bad_request', 'That Glim cannot be crafted.');
      const cost = RARITY_INFO[item.rarity as Rarity].craftCost;
      await debit(tx, { userId: auth.user.id, currency: 'dust', amount: cost, reason: 'craft', refType: 'item', refId: item.id, opId });
      const quantity = await grantItem(tx, { userId: auth.user.id, itemId: item.id, source: 'craft' });
      const completed = quantity === 1 ? await payCollectionRewards(tx, auth.user.id, opId) : [];
      await checkAchievements(tx, auth.user.id, opId);
      return { itemId: item.id, name: item.name, cost, quantity, collectionsCompleted: completed };
    });
    return { ...result, balances: await balancesOf(deps.db, auth.user.id) };
  });

  /** The player's own ledger, newest first: every Spark, Moonstone and Dust they gained or spent, and why. */
  app.get('/api/me/transactions', async (req, reply) => {
    noStore(reply);
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
    const rows = await deps.db
      .select({ id: ledger.id, currency: ledger.currency, delta: ledger.delta, balanceAfter: ledger.balanceAfter, reason: ledger.reason, refType: ledger.refType, refId: ledger.refId, unlimited: ledger.unlimited, createdAt: ledger.createdAt })
      .from(ledger)
      .where(and(eq(ledger.userId, auth.user.id), q.before ? lt(ledger.id, q.before) : sql`true`))
      .orderBy(desc(ledger.id))
      .limit(q.limit);
    return { entries: rows, nextBefore: rows.length === q.limit ? rows[rows.length - 1]!.id : null };
  });

}
