import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  ITEM_TYPES,
  RARITIES,
  RELEASE_STATES,
  SHOP_SECTIONS,
  currencyCodeSchema,
  dropTableSchema,
  itemArtSchema,
  lanternArtSchema,
  staffReasonSchema,
} from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import { collections, currencies, featureFlags, inventory, items, packs, purchases, shopListings } from '../../db/schema.ts';
import { outer } from '../../db/sql.ts';
import { noStore } from '../../http/context.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { randomToken } from '../../lib/crypto.ts';
import { parse } from '../../lib/validate.ts';
import { clearFlagCache } from '../flags/service.ts';
import { EVENTS, eventWindow, saveEventWindow } from '../events/service.ts';
import { computeOdds, resolvePool } from '../packs/service.ts';
import { rotationPicks } from '../shop/service.ts';
import { audit, likeEscape, requireConfirm, staff, staffLimit } from './common.ts';

const isoDate = z.iso.datetime({ offset: true });
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/, 'Use 3-64 lowercase letters, digits and dashes.');
const text = (max: number) => z.string().trim().min(1).max(max);
const nullableDate = isoDate.nullable();
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

const itemCreateSchema = z.object({
  id: slug,
  type: z.enum(ITEM_TYPES),
  name: text(48),
  description: text(240),
  rarity: z.enum(RARITIES),
  art: itemArtSchema,
  collectionId: z.string().max(64).nullable().default(null),
  releaseState: z.enum(RELEASE_STATES).default('draft'),
  isTestOnly: z.boolean().default(false),
  sort: z.number().int().min(-100_000).max(100_000).default(0),
  reason: staffReasonSchema,
});

const itemPatchSchema = z.object({
  name: text(48).optional(),
  description: text(240).optional(),
  rarity: z.enum(RARITIES).optional(),
  art: itemArtSchema.optional(),
  collectionId: z.string().max(64).nullable().optional(),
  releaseState: z.enum(RELEASE_STATES).optional(),
  isTestOnly: z.boolean().optional(),
  sort: z.number().int().min(-100_000).max(100_000).optional(),
  reason: staffReasonSchema,
});

const collectionPatchSchema = z.object({
  name: text(48).optional(),
  description: text(240).optional(),
  hue: z.number().int().min(0).max(359).optional(),
  reward: z.object({ currency: currencyCodeSchema, amount: z.number().int().min(1).max(100_000) }).nullable().optional(),
  releaseState: z.enum(RELEASE_STATES).optional(),
  sort: z.number().int().min(-1000).max(1000).optional(),
  reason: staffReasonSchema,
});

const packFields = {
  name: text(48),
  description: text(240),
  art: lanternArtSchema,
  priceCurrency: currencyCodeSchema,
  priceAmount: z.number().int().min(0).max(1_000_000),
  dropTable: dropTableSchema,
  releaseState: z.enum(RELEASE_STATES),
  availableFrom: nullableDate,
  availableUntil: nullableDate,
  sort: z.number().int().min(-1000).max(1000),
};
const packCreateSchema = z.object({
  id: slug,
  ...packFields,
  releaseState: packFields.releaseState.default('draft'),
  availableFrom: nullableDate.default(null),
  availableUntil: nullableDate.default(null),
  sort: packFields.sort.default(0),
  addListing: z.boolean().default(true),
  reason: staffReasonSchema,
});
const packPatchSchema = z.object(packFields).partial().extend({ reason: staffReasonSchema });

const listingFields = {
  section: z.enum(SHOP_SECTIONS),
  title: z.string().trim().max(60).nullable(),
  description: z.string().trim().max(240).nullable(),
  priceCurrency: currencyCodeSchema,
  priceAmount: z.number().int().min(0).max(1_000_000),
  worth: z.number().int().min(0).max(10_000_000).nullable(),
  perUserLimit: z.number().int().min(1).max(1000).nullable(),
  rotation: z.enum(['daily', 'weekly']).nullable(),
  startsAt: nullableDate,
  endsAt: nullableDate,
  active: z.boolean(),
  sort: z.number().int().min(-100_000).max(100_000),
};
const listingCreateSchema = z
  .object({
    itemId: z.string().max(64).optional(),
    packId: z.string().max(64).optional(),
    bundle: z.array(z.string().max(64)).min(2).max(10).optional(),
    ...listingFields,
    title: listingFields.title.default(null),
    description: listingFields.description.default(null),
    worth: listingFields.worth.default(null),
    perUserLimit: listingFields.perUserLimit.default(null),
    rotation: listingFields.rotation.default(null),
    startsAt: nullableDate.default(null),
    endsAt: nullableDate.default(null),
    active: listingFields.active.default(true),
    sort: listingFields.sort.default(0),
    reason: staffReasonSchema,
  })
  .refine((l) => [l.itemId, l.packId, l.bundle].filter(Boolean).length === 1, 'A listing sells exactly one item, one Lantern or one bundle.');
const listingPatchSchema = z.object(listingFields).partial().extend({ reason: staffReasonSchema });

const eventPatchSchema = z.object({ enabled: z.boolean().optional(), startsAt: isoDate.optional(), endsAt: isoDate.optional(), reason: staffReasonSchema, confirm: z.string().max(80).optional() });

async function assertCurrency(db: AppDeps['db'], code: string) {
  const [c] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, code)).limit(1);
  if (!c) throw new AppError(400, 'validation_failed', `Unknown currency ${code}.`, { priceCurrency: 'Unknown currency.' });
}

async function assertCollection(db: AppDeps['db'], id: string | null | undefined) {
  if (!id) return;
  const [c] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, id)).limit(1);
  if (!c) throw new AppError(400, 'validation_failed', 'Unknown collection.', { collectionId: 'Unknown collection.' });
}

function assertWindow(from: Date | null | undefined, until: Date | null | undefined) {
  if (from && until && from >= until) throw new AppError(400, 'validation_failed', 'The end has to come after the start.', { endsAt: 'Must be after the start.' });
}

/** The odds a drop table would produce right now, or a validation error if it cannot drop anything. */
async function oddsFor(db: AppDeps['db'], table: z.infer<typeof dropTableSchema>) {
  const pool = await resolvePool(db, table);
  if (!pool.length) throw new AppError(400, 'validation_failed', 'Nothing live can drop from this Lantern. Add a collection or items that are live.', { dropTable: 'Empty pool.' });
  const odds = computeOdds(table, pool);
  if (!odds.length) throw new AppError(400, 'validation_failed', 'Every rarity that has Glims is weighted 0.', { 'dropTable.weights': 'All zero.' });
  return { odds, pool };
}

export async function adminCatalogRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /* ---------------------------------- items ---------------------------------- */

  app.get('/api/admin/items', async (req, reply) => {
    noStore(reply);
    staff(req, 'catalog.manage');
    const q = parse(
      z.object({
        q: z.string().trim().max(60).optional(),
        type: z.enum(ITEM_TYPES).optional(),
        rarity: z.enum(RARITIES).optional(),
        state: z.enum(RELEASE_STATES).optional(),
        collection: z.string().max(64).optional(),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
      }),
      req.query,
    );
    const conds: (SQL | undefined)[] = [];
    if (q.q) conds.push(or(ilike(items.name, `%${likeEscape(q.q)}%`), ilike(items.id, `%${likeEscape(q.q)}%`)));
    if (q.type) conds.push(eq(items.type, q.type));
    if (q.rarity) conds.push(eq(items.rarity, q.rarity));
    if (q.state) conds.push(eq(items.releaseState, q.state));
    if (q.collection) conds.push(eq(items.collectionId, q.collection));
    const where = and(...conds);
    const [rows, [total]] = await Promise.all([
      db
        .select({ i: items, owners: sql<number>`(select count(*)::int from ${inventory} where ${inventory.itemId} = ${outer(items.id)} and ${inventory.quantity} > 0)` })
        .from(items)
        .where(where)
        .orderBy(asc(items.type), asc(items.sort), asc(items.id))
        .limit(100)
        .offset(q.offset),
      db.select({ n: count() }).from(items).where(where),
    ]);
    return { items: rows.map(({ i, owners }) => ({ ...i, owners, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })), total: total?.n ?? 0, offset: q.offset, pageSize: 100 };
  });

  app.post('/api/admin/items', staffLimit(20), async (req) => {
    const auth = staff(req, 'catalog.manage');
    const body = parse(itemCreateSchema, req.body);
    if (body.art.kind !== body.type) throw new AppError(400, 'validation_failed', 'The art does not match the item type.', { art: `Expected art of kind ${body.type}.` });
    await assertCollection(db, body.collectionId);
    const { reason, ...values } = body;
    return db.transaction(async (tx) => {
      const [created] = await tx.insert(items).values({ ...values, customizedAt: new Date() }).onConflictDoNothing().returning();
      if (!created) throw conflict('An item with that id already exists.', { id: 'Already taken.' });
      await audit(deps, req, tx, { actor: auth, action: 'item.create', targetType: 'item', targetId: created.id, targetName: created.name, reason, after: created });
      return { ok: true, item: created };
    });
  });

  app.patch('/api/admin/items/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'catalog.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const body = parse(itemPatchSchema, req.body);
    const { reason, ...patch } = body;
    await assertCollection(db, patch.collectionId);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(items).where(eq(items.id, id)).for('update');
      if (!before) throw notFound('No item with that id.');
      if (patch.art && patch.art.kind !== before.type) throw new AppError(400, 'validation_failed', 'The art does not match the item type.', { art: `Expected art of kind ${before.type}.` });
      const [after] = await tx.update(items).set({ ...patch, updatedAt: new Date(), customizedAt: new Date() }).where(eq(items.id, id)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'item.update', targetType: 'item', targetId: id, targetName: before.name, reason, before, after });
      return { ok: true, item: after };
    });
  });

  app.get('/api/admin/collections', async (req, reply) => {
    noStore(reply);
    staff(req, 'catalog.manage');
    const rows = await db
      .select({ c: collections, items: sql<number>`(select count(*)::int from ${items} where ${items.collectionId} = ${outer(collections.id)} and ${items.releaseState} = 'live')` })
      .from(collections)
      .orderBy(asc(collections.sort));
    return { collections: rows.map(({ c, items: n }) => ({ ...c, liveItems: n })) };
  });

  app.patch('/api/admin/collections/:id', staffLimit(20), async (req) => {
    const auth = staff(req, 'catalog.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const { reason, ...patch } = parse(collectionPatchSchema, req.body);
    if (patch.reward) await assertCurrency(db, patch.reward.currency);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(collections).where(eq(collections.id, id)).for('update');
      if (!before) throw notFound('No collection with that id.');
      const [after] = await tx.update(collections).set(patch).where(eq(collections.id, id)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'collection.update', targetType: 'collection', targetId: id, targetName: before.name, reason, before, after });
      return { ok: true, collection: after };
    });
  });

  /* --------------------------------- Lanterns -------------------------------- */

  app.get('/api/admin/packs', async (req, reply) => {
    noStore(reply);
    staff(req, 'catalog.manage');
    const rows = await db.select().from(packs).orderBy(asc(packs.sort));
    const listingRows = rows.length ? await db.select().from(shopListings).where(inArray(shopListings.packId, rows.map((r) => r.id))) : [];
    const out = [];
    for (const p of rows) {
      const table = dropTableSchema.safeParse(p.dropTable);
      let odds = null;
      let poolSize = 0;
      if (table.success) {
        const pool = await resolvePool(db, table.data);
        poolSize = pool.length;
        odds = computeOdds(table.data, pool);
      }
      out.push({
        ...p,
        availableFrom: p.availableFrom?.toISOString() ?? null,
        availableUntil: p.availableUntil?.toISOString() ?? null,
        odds,
        poolSize,
        valid: table.success,
        listings: listingRows.filter((l) => l.packId === p.id).map((l) => ({ id: l.id, section: l.section, price: { currency: l.priceCurrency, amount: l.priceAmount }, active: l.active })),
      });
    }
    return { packs: out };
  });

  /** What a drop table would do, without saving it. */
  app.post('/api/admin/packs/preview', staffLimit(60), async (req) => {
    staff(req, 'catalog.manage');
    const { dropTable } = parse(z.object({ dropTable: dropTableSchema }), req.body);
    const { odds, pool } = await oddsFor(db, dropTable);
    return { odds, pool: pool.map((p) => ({ id: p.id, name: p.name, rarity: p.rarity })) };
  });

  app.post('/api/admin/packs', staffLimit(10), async (req) => {
    const auth = staff(req, 'catalog.manage');
    const body = parse(packCreateSchema, req.body);
    await assertCurrency(db, body.priceCurrency);
    assertWindow(toDate(body.availableFrom), toDate(body.availableUntil));
    await oddsFor(db, body.dropTable);
    const { reason, addListing, ...values } = body;
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(packs)
        .values({ ...values, availableFrom: toDate(values.availableFrom) ?? null, availableUntil: toDate(values.availableUntil) ?? null })
        .onConflictDoNothing()
        .returning();
      if (!created) throw conflict('A Lantern with that id already exists.', { id: 'Already taken.' });
      if (addListing) {
        await tx.insert(shopListings).values({ id: `l-${created.id}`, section: 'lanterns', packId: created.id, priceCurrency: created.priceCurrency, priceAmount: created.priceAmount, sort: created.sort }).onConflictDoNothing();
      }
      await audit(deps, req, tx, { actor: auth, action: 'pack.create', targetType: 'pack', targetId: created.id, targetName: created.name, reason, after: created });
      return { ok: true, pack: created };
    });
  });

  app.patch('/api/admin/packs/:id', staffLimit(30), async (req) => {
    const auth = staff(req, 'catalog.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const { reason, ...patch } = parse(packPatchSchema, req.body);
    if (patch.priceCurrency) await assertCurrency(db, patch.priceCurrency);
    if (patch.dropTable) await oddsFor(db, patch.dropTable);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(packs).where(eq(packs.id, id)).for('update');
      if (!before) throw notFound('No Lantern with that id.');
      const from = patch.availableFrom !== undefined ? toDate(patch.availableFrom) : before.availableFrom;
      const until = patch.availableUntil !== undefined ? toDate(patch.availableUntil) : before.availableUntil;
      assertWindow(from, until);
      const [after] = await tx
        .update(packs)
        .set({ ...patch, availableFrom: from ?? null, availableUntil: until ?? null })
        .where(eq(packs.id, id))
        .returning();
      // Shop listings that sold the Lantern at its old price follow the new one; deliberate discounts are left alone.
      let listingsRepriced = 0;
      if (patch.priceAmount !== undefined || patch.priceCurrency !== undefined) {
        const moved = await tx
          .update(shopListings)
          .set({ priceAmount: after!.priceAmount, priceCurrency: after!.priceCurrency })
          .where(and(eq(shopListings.packId, id), eq(shopListings.priceAmount, before.priceAmount), eq(shopListings.priceCurrency, before.priceCurrency)))
          .returning({ id: shopListings.id });
        listingsRepriced = moved.length;
      }
      await audit(deps, req, tx, { actor: auth, action: 'pack.update', targetType: 'pack', targetId: id, targetName: before.name, reason, before, after: { ...after, listingsRepriced } });
      return { ok: true, pack: after, listingsRepriced };
    });
  });

  /* ---------------------------------- shop ----------------------------------- */

  app.get('/api/admin/shop/listings', async (req, reply) => {
    noStore(reply);
    staff(req, 'shop.manage');
    const q = parse(z.object({ section: z.enum(SHOP_SECTIONS).optional(), q: z.string().trim().max(60).optional(), active: z.enum(['1', '0']).optional() }), req.query);
    const conds: (SQL | undefined)[] = [];
    if (q.section) conds.push(eq(shopListings.section, q.section));
    if (q.active) conds.push(eq(shopListings.active, q.active === '1'));
    if (q.q) conds.push(or(ilike(shopListings.id, `%${likeEscape(q.q)}%`), ilike(shopListings.title, `%${likeEscape(q.q)}%`), ilike(items.name, `%${likeEscape(q.q)}%`), ilike(packs.name, `%${likeEscape(q.q)}%`)));
    const rows = await db
      .select({ l: shopListings, itemName: items.name, itemType: items.type, itemRarity: items.rarity, itemState: items.releaseState, packName: packs.name })
      .from(shopListings)
      .leftJoin(items, eq(items.id, shopListings.itemId))
      .leftJoin(packs, eq(packs.id, shopListings.packId))
      .where(and(...conds))
      .orderBy(asc(shopListings.section), asc(shopListings.sort), asc(shopListings.id))
      .limit(500);
    const all = await db.select().from(shopListings);
    const daily = rotationPicks(all, 'daily');
    const weekly = rotationPicks(all, 'weekly');
    const sold = await db.select({ listingId: purchases.listingId, n: sql<number>`count(*)::int` }).from(purchases).groupBy(purchases.listingId);
    const soldBy = new Map(sold.map((s) => [s.listingId, s.n]));
    return {
      listings: rows.map(({ l, itemName, itemType, itemRarity, itemState, packName }) => ({
        ...l,
        startsAt: l.startsAt?.toISOString() ?? null,
        endsAt: l.endsAt?.toISOString() ?? null,
        target: l.itemId ? { kind: 'item', name: itemName, type: itemType, rarity: itemRarity, releaseState: itemState } : l.packId ? { kind: 'pack', name: packName } : { kind: 'bundle', name: l.title, items: l.bundle },
        inRotationToday: l.rotation === 'daily' ? daily.has(l.id) : l.rotation === 'weekly' ? weekly.has(l.id) : null,
        sold: soldBy.get(l.id) ?? 0,
      })),
    };
  });

  app.post('/api/admin/shop/listings', staffLimit(30), async (req) => {
    const auth = staff(req, 'shop.manage');
    const body = parse(listingCreateSchema, req.body);
    await assertCurrency(db, body.priceCurrency);
    assertWindow(toDate(body.startsAt), toDate(body.endsAt));
    const ids = body.itemId ? [body.itemId] : (body.bundle ?? []);
    if (ids.length) {
      const found = await db.select().from(items).where(inArray(items.id, ids));
      if (found.length !== new Set(ids).size) throw new AppError(400, 'validation_failed', 'One of those items does not exist.', { itemId: 'Unknown item.' });
      if (found.some((i) => i.isTestOnly)) throw conflict('Test-only items cannot be sold in the shop.');
    }
    if (body.packId) {
      const [p] = await db.select({ id: packs.id }).from(packs).where(eq(packs.id, body.packId)).limit(1);
      if (!p) throw new AppError(400, 'validation_failed', 'That Lantern does not exist.', { packId: 'Unknown Lantern.' });
    }
    const { reason, ...rest } = body;
    const id = `l-custom-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(shopListings)
        .values({ ...rest, id, itemId: rest.itemId ?? null, packId: rest.packId ?? null, bundle: rest.bundle ?? null, startsAt: toDate(rest.startsAt) ?? null, endsAt: toDate(rest.endsAt) ?? null })
        .returning();
      await audit(deps, req, tx, { actor: auth, action: 'listing.create', targetType: 'listing', targetId: id, targetName: created!.title ?? id, reason, after: created });
      return { ok: true, listing: created };
    });
  });

  app.patch('/api/admin/shop/listings/:id', staffLimit(60), async (req) => {
    const auth = staff(req, 'shop.manage');
    const { id } = parse(z.object({ id: z.string().min(1).max(80) }), req.params);
    const { reason, ...patch } = parse(listingPatchSchema, req.body);
    if (patch.priceCurrency) await assertCurrency(db, patch.priceCurrency);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(shopListings).where(eq(shopListings.id, id)).for('update');
      if (!before) throw notFound('No listing with that id.');
      const startsAt = patch.startsAt !== undefined ? toDate(patch.startsAt) : before.startsAt;
      const endsAt = patch.endsAt !== undefined ? toDate(patch.endsAt) : before.endsAt;
      assertWindow(startsAt, endsAt);
      const [after] = await tx.update(shopListings).set({ ...patch, startsAt: startsAt ?? null, endsAt: endsAt ?? null }).where(eq(shopListings.id, id)).returning();
      await audit(deps, req, tx, { actor: auth, action: 'listing.update', targetType: 'listing', targetId: id, targetName: before.title ?? id, reason, before, after });
      return { ok: true, listing: after };
    });
  });

  /* --------------------------------- events ---------------------------------- */

  app.get('/api/admin/events', async (req, reply) => {
    noStore(reply);
    staff(req, 'events.manage');
    const now = new Date();
    const out = [];
    for (const ev of EVENTS) {
      const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, ev.flag)).limit(1);
      const w = await eventWindow(db, ev);
      const [listings] = await db.select({ n: count() }).from(shopListings).where(and(eq(shopListings.section, ev.section), eq(shopListings.active, true)));
      const [cur] = await db.select().from(currencies).where(eq(currencies.code, ev.currency)).limit(1);
      const [holders] = await db.execute<{ n: string; total: string }>(sql`select count(*) filter (where balance > 0) as n, coalesce(sum(balance), 0) as total from wallets where currency = ${ev.currency}`).then((r) => r.rows);
      out.push({
        key: ev.key,
        name: ev.name,
        flag: ev.flag,
        enabled: Boolean(flag?.enabled),
        startsAt: w.startsAt.toISOString(),
        endsAt: w.endsAt.toISOString(),
        running: Boolean(flag?.enabled) && w.startsAt <= now && now <= w.endsAt,
        listings: listings?.n ?? 0,
        currency: cur ? { code: cur.code, name: cur.name, expiresAt: cur.expiresAt?.toISOString() ?? null, holders: Number(holders?.n ?? 0), circulating: Number(holders?.total ?? 0) } : null,
      });
    }
    return { events: out };
  });

  /**
   * Switch an event on or off, or move its dates. Moving the dates moves its
   * shop listings and its currency's expiry with it, in one transaction.
   */
  app.patch('/api/admin/events/:key', staffLimit(10), async (req) => {
    const auth = staff(req, 'events.manage');
    const { key } = parse(z.object({ key: z.string().max(40) }), req.params);
    const ev = EVENTS.find((e) => e.key === key);
    if (!ev) throw notFound('No event with that key.');
    const body = parse(eventPatchSchema, req.body);
    return db.transaction(async (tx) => {
      const [flag] = await tx.select().from(featureFlags).where(eq(featureFlags.key, ev.flag)).for('update');
      const beforeWindow = await eventWindow(tx, ev);
      const w = { startsAt: body.startsAt ? new Date(body.startsAt) : beforeWindow.startsAt, endsAt: body.endsAt ? new Date(body.endsAt) : beforeWindow.endsAt };
      assertWindow(w.startsAt, w.endsAt);
      // Ending an event early makes its currency unspendable for everyone holding it, so it needs typing out.
      if (body.enabled === false && flag?.enabled) requireConfirm(body.confirm, ev.key, 'the event key');
      if (body.enabled !== undefined) {
        await tx.update(featureFlags).set({ enabled: body.enabled, updatedAt: new Date(), updatedBy: auth.user.id }).where(eq(featureFlags.key, ev.flag));
      }
      if (body.startsAt || body.endsAt) {
        await saveEventWindow(tx, ev, w, auth.user.id);
        await tx.update(shopListings).set({ startsAt: w.startsAt, endsAt: w.endsAt }).where(eq(shopListings.section, ev.section));
        await tx.update(currencies).set({ expiresAt: w.endsAt }).where(eq(currencies.code, ev.currency));
      }
      await audit(deps, req, tx, {
        actor: auth,
        action: 'event.update',
        targetType: 'event',
        targetId: ev.key,
        targetName: ev.name,
        reason: body.reason,
        before: { enabled: Boolean(flag?.enabled), startsAt: beforeWindow.startsAt, endsAt: beforeWindow.endsAt },
        after: { enabled: body.enabled ?? Boolean(flag?.enabled), startsAt: w.startsAt, endsAt: w.endsAt },
      });
      clearFlagCache();
      return { ok: true };
    });
  });
}
