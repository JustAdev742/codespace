import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { STUDIO_PRICES, canonicalArt, studioDraftSchema, studioLanternSchema, studioPublishSchema, type StudioDraftInput, type StudioKind } from '@ludora/shared';
import { STANDARD_WEIGHTS } from '@ludora/content';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { collections, items, packs, shopListings, studioDrafts, users } from '../../db/schema.ts';
import { noStore } from '../../http/context.ts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, staff, staffLimit } from '../admin/common.ts';

/*
 * The Creator Studio. Only accounts holding the designer role (or an
 * administrator) can reach any of it: every route checks `studio.use` or
 * `studio.publish` on the server, and a guest never can. Designers make
 * drafts from the Glim genome and the cosmetic vocabulary, so whatever they
 * make keeps the house style; publishing turns a draft into a real item, and
 * optionally a shop listing or a limited Lantern, with a reason and an audit
 * entry. Drafts are shared between designers; only the maker (or someone with
 * catalog.manage) can change one.
 */

const STUDIO_COLLECTION = { id: 'studio', name: 'Studio Glims', description: 'Made by Ludora’s own designers, one at a time. Find them in the shop.', hue: 300, reward: null, releaseState: 'live', sort: 300 } as const;
const PREFIX: Record<StudioKind, string> = { glim: 'glim-', accessory: 'acc-', frame: 'frame-', banner: 'banner-', title: 'title-' };
const SECTION: Record<StudioKind, 'glims' | 'accessories' | 'profile'> = { glim: 'glims', accessory: 'accessories', frame: 'profile', banner: 'profile', title: 'profile' };

type DraftRow = typeof studioDrafts.$inferSelect;

/** Four lowercase hex characters, for telling apart ids that share a name. */
const tag = () => randomBytes(2).toString('hex');

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item';

/** A free item id in the catalogue's style: `glim-starling`, or `glim-starling-3f9a` if that is taken. */
async function freeItemId(db: DbOrTx, kind: StudioKind, name: string): Promise<string> {
  const base = `${PREFIX[kind]}${slug(name)}`;
  for (let i = 0; i < 6; i++) {
    const id = i === 0 ? base : `${base}-${tag()}`;
    const [hit] = await db.select({ id: items.id }).from(items).where(eq(items.id, id)).limit(1);
    if (!hit) return id;
  }
  throw new AppError(409, 'conflict', 'Could not find a free id for that name. Try another name.');
}

/** House rules beyond the schema: no two Glims share a name or art, and no two items of a kind share a name. */
async function assertUnique(db: DbOrTx, d: StudioDraftInput, exceptDraft: string | null) {
  const sameKind = await db.select({ name: items.name, art: items.art }).from(items).where(eq(items.type, d.kind));
  const drafts = await db
    .select({ name: studioDrafts.name, art: studioDrafts.art })
    .from(studioDrafts)
    .where(and(eq(studioDrafts.kind, d.kind), eq(studioDrafts.status, 'draft'), exceptDraft ? ne(studioDrafts.id, exceptDraft) : sql`true`));
  const all = [...sameKind, ...drafts];
  const name = d.name.trim().toLowerCase();
  if (all.some((x) => x.name.trim().toLowerCase() === name)) throw new AppError(409, 'conflict', `There is already a ${d.kind === 'glim' ? 'Glim' : 'item'} called ${d.name}.`, { name: 'That name is taken.' });
  if (d.kind === 'glim') {
    const mine = canonicalArt(d.art);
    if (all.some((x) => canonicalArt(x.art) === mine)) throw new AppError(409, 'conflict', 'Another Glim already looks exactly like this. Change something about it.', { art: 'Exactly like another Glim.' });
  }
}

function draftView(r: DraftRow & { ownerName: string | null }, me: string) {
  return { id: r.id, kind: r.kind, name: r.name, description: r.description, rarity: r.rarity, art: r.art, status: r.status, itemId: r.itemId, owner: r.ownerId ? { id: r.ownerId, name: r.ownerName } : null, mine: r.ownerId === me, updatedAt: r.updatedAt.toISOString() };
}

async function loadDraft(db: DbOrTx, id: string, lock = false): Promise<DraftRow> {
  if (!z.string().uuid().safeParse(id).success) throw notFound('No draft with that id.');
  const q = db.select().from(studioDrafts).where(eq(studioDrafts.id, id)).limit(1);
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw notFound('No draft with that id.');
  return row;
}

function assertCanEdit(row: DraftRow, auth: { user: { id: string }; permissions: Set<string> }) {
  if (row.ownerId !== auth.user.id && !auth.permissions.has('catalog.manage')) throw forbidden('Only the designer who made this draft can change it.');
  if (row.status !== 'draft') throw conflict('This is already published. Change it from the staff catalogue.');
}

function assertPrice(rarity: string, amount: number) {
  const band = STUDIO_PRICES[rarity as keyof typeof STUDIO_PRICES];
  if (!band || amount < band.min || amount > band.max) throw new AppError(400, 'validation_failed', `A ${rarity} item costs ${band?.min ?? '?'} to ${band?.max ?? '?'} Sparks.`, { priceAmount: `${band?.min ?? '?'} to ${band?.max ?? '?'} Sparks for ${rarity}.` });
}

/** Turn a draft into a live item. Glims go into `collectionId` (the Studio collection unless a Lantern says otherwise). */
async function publishDraft(tx: DbOrTx, row: DraftRow, collectionId: string | null): Promise<string> {
  const input = studioDraftSchema.parse({ kind: row.kind, name: row.name, description: row.description, rarity: row.rarity, art: row.art });
  await assertUnique(tx, input, row.id);
  const id = await freeItemId(tx, input.kind, input.name);
  const now = new Date();
  await tx.insert(items).values({ id, type: input.kind, name: input.name, description: input.description, rarity: input.rarity, collectionId: input.kind === 'glim' ? collectionId : null, art: input.art, releaseState: 'live', sort: 0, customizedAt: now });
  await tx.update(studioDrafts).set({ status: 'published', itemId: id, updatedAt: now }).where(eq(studioDrafts.id, row.id));
  return id;
}

export async function studioRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.get('/api/studio', async (req, reply) => {
    noStore(reply);
    const auth = staff(req, 'studio.use');
    const rows = await db
      .select({ d: studioDrafts, ownerName: users.displayName })
      .from(studioDrafts)
      .leftJoin(users, eq(users.id, studioDrafts.ownerId))
      .orderBy(desc(studioDrafts.updatedAt))
      .limit(300);
    return {
      drafts: rows.map((r) => draftView({ ...r.d, ownerName: r.ownerName }, auth.user.id)),
      canPublish: auth.permissions.has('studio.publish'),
      prices: STUDIO_PRICES,
    };
  });

  /** Is this name or look free? The maker asks as you type, so a clash shows before you save. */
  app.post('/api/studio/check', staffLimit(120), async (req) => {
    staff(req, 'studio.use');
    const body = parse(z.object({ draft: studioDraftSchema, draftId: z.string().uuid().nullable().default(null) }), req.body);
    try {
      await assertUnique(db, body.draft, body.draftId);
      return { ok: true, problem: null };
    } catch (err) {
      if (err instanceof AppError && err.status === 409) return { ok: false, problem: err.message };
      throw err;
    }
  });

  app.post('/api/studio/drafts', staffLimit(60), async (req) => {
    const auth = staff(req, 'studio.use');
    const d = parse(studioDraftSchema, req.body);
    await assertUnique(db, d, null);
    const [row] = await db.insert(studioDrafts).values({ ownerId: auth.user.id, kind: d.kind, name: d.name, description: d.description, rarity: d.rarity, art: d.art }).returning();
    return { draft: draftView({ ...row!, ownerName: auth.user.displayName }, auth.user.id) };
  });

  app.patch('/api/studio/drafts/:id', staffLimit(120), async (req) => {
    const auth = staff(req, 'studio.use');
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const d = parse(studioDraftSchema, req.body);
    return db.transaction(async (tx) => {
      const row = await loadDraft(tx, id, true);
      assertCanEdit(row, auth);
      await assertUnique(tx, d, row.id);
      const [after] = await tx.update(studioDrafts).set({ kind: d.kind, name: d.name, description: d.description, rarity: d.rarity, art: d.art, updatedAt: new Date() }).where(eq(studioDrafts.id, id)).returning();
      return { draft: draftView({ ...after!, ownerName: null }, auth.user.id) };
    });
  });

  app.delete('/api/studio/drafts/:id', staffLimit(60), async (req) => {
    const auth = staff(req, 'studio.use');
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const row = await loadDraft(db, id);
    assertCanEdit(row, auth);
    await db.delete(studioDrafts).where(and(eq(studioDrafts.id, id), eq(studioDrafts.status, 'draft')));
    return { ok: true };
  });

  /** Publish one draft as a live item, and put it in the shop if a listing is given. */
  app.post('/api/studio/drafts/:id/publish', staffLimit(20), async (req) => {
    const auth = staff(req, 'studio.publish');
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const body = parse(studioPublishSchema, req.body);
    return db.transaction(async (tx) => {
      const row = await loadDraft(tx, id, true);
      assertCanEdit(row, auth);
      if (body.listing) assertPrice(row.rarity, body.listing.priceAmount);
      if (row.kind === 'glim') await tx.insert(collections).values(STUDIO_COLLECTION).onConflictDoNothing();
      const itemId = await publishDraft(tx, row, STUDIO_COLLECTION.id);
      let listingId: string | null = null;
      if (body.listing) {
        listingId = `l-studio-${itemId}`;
        await tx.insert(shopListings).values({
          id: listingId,
          section: SECTION[row.kind as StudioKind],
          itemId,
          priceCurrency: 'sparks',
          priceAmount: body.listing.priceAmount,
          perUserLimit: 1,
          startsAt: body.listing.startsAt ? new Date(body.listing.startsAt) : null,
          endsAt: body.listing.endsAt ? new Date(body.listing.endsAt) : null,
          active: true,
          sort: 0,
        });
      }
      await audit(deps, req, tx, { actor: auth, action: 'studio.publish', targetType: 'item', targetId: itemId, targetName: row.name, reason: body.reason, before: { draft: row.id }, after: { itemId, listing: body.listing } });
      return { ok: true, itemId, listingId };
    });
  });

  /**
   * A limited Lantern from Glim drafts: they are published together into a
   * collection of their own, sold only in this Lantern, between two dates.
   * Odds are the standard weights rescaled to the rarities inside, and are
   * shown on the Lantern like every other.
   */
  app.post('/api/studio/lanterns', staffLimit(10), async (req) => {
    const auth = staff(req, 'studio.publish');
    const body = parse(studioLanternSchema, req.body);
    return db.transaction(async (tx) => {
      const rows = await tx.select().from(studioDrafts).where(inArray(studioDrafts.id, body.draftIds)).for('update');
      if (rows.length !== body.draftIds.length) throw notFound('One of those drafts is gone.');
      for (const r of rows) {
        if (r.kind !== 'glim') throw new AppError(400, 'validation_failed', `${r.name} is not a Glim. Lanterns hold Glims.`);
        assertCanEdit(r, auth);
      }
      const collectionId = `studio-${slug(body.name)}-${tag()}`;
      const name = body.name.trim();
      await tx.insert(collections).values({ id: collectionId, name: `${name} Glims`, description: body.description, hue: body.hue, reward: { currency: 'moonstones', amount: 20 }, releaseState: 'live', sort: 250 });
      const published: string[] = [];
      for (const id of body.draftIds) published.push(await publishDraft(tx, rows.find((r) => r.id === id)!, collectionId));
      const hasEpic = rows.some((r) => ['epic', 'legendary'].includes(r.rarity));
      const packId = `lantern-${collectionId}`;
      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      await tx.insert(packs).values({
        id: packId,
        name: `${name} Lantern`,
        description: `Holds one Glim from the ${name} Glims collection. On sale for a limited time.`,
        art: { hue: body.hue, accentHue: body.accentHue, pattern: body.pattern },
        priceCurrency: 'sparks',
        priceAmount: body.priceAmount,
        dropTable: { weights: STANDARD_WEIGHTS, itemIds: [], collectionIds: [collectionId], pityEvery: hasEpic ? 15 : 0 },
        releaseState: 'live',
        availableFrom: startsAt,
        availableUntil: endsAt,
        sort: 60,
      });
      for (const section of ['featured', 'lanterns'] as const) {
        await tx.insert(shopListings).values({ id: `l-${section}-${packId}`, section, packId, priceCurrency: 'sparks', priceAmount: body.priceAmount, startsAt, endsAt, active: true, sort: 0 });
      }
      await audit(deps, req, tx, { actor: auth, action: 'studio.lantern', targetType: 'pack', targetId: packId, targetName: `${name} Lantern`, reason: body.reason, before: null, after: { collectionId, items: published, priceAmount: body.priceAmount, startsAt: body.startsAt, endsAt: body.endsAt } });
      return { ok: true, packId, collectionId, itemIds: published };
    });
  });
}
